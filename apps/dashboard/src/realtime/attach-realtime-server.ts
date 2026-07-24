import type { Server as HttpServer } from "node:http";

import type { DashboardAccessCacheClient } from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";
import {
  REALTIME_LOGS_ERROR,
  REALTIME_LOGS_EVENT,
  REALTIME_LOGS_SUBSCRIBE,
  REALTIME_LOGS_UNSUBSCRIBE,
  type RealtimeLogEventPayload
} from "@sm-bot/shared";
import { Server as SocketIOServer, type Socket } from "socket.io";

import {
  authenticateRealtimeSubscription as authenticateRealtimeSubscriptionDefault
} from "./authenticate-realtime-subscription";
import {
  pollRealtimeLogStream as pollRealtimeLogStreamDefault,
  type XReadClient
} from "./poll-realtime-log-stream";

const DEFAULT_POLL_INTERVAL_MS = 250;

export interface ConnectionHandlerDeps {
  authenticate: (guildId: string, headers: Record<string, string | string[] | undefined>) => Promise<
    { ok: true; userId: string; canViewRaw: boolean } | { ok: false; reason: "unauthenticated" | "forbidden" }
  >;
  poll: (
    guildId: string,
    lastId: string
  ) => ReturnType<typeof pollRealtimeLogStreamDefault>;
  pollIntervalMs: number;
}

export function createRealtimeLogsConnectionHandler(deps: ConnectionHandlerDeps) {
  return (socket: Socket) => {
    // disconnected: ソケット自体が切断済み(以後は二度とsubscribeを受け付けない)。
    // cancelCurrentSubscription: 現在アクティブな購読ループを止める関数
    // (unsubscribe/再subscribe/disconnectのいずれでも呼ばれる。購読自体は
    // 再subscribeで何度でも再開できる)。
    let disconnected = false;
    let cancelCurrentSubscription: (() => void) | null = null;

    function stopCurrentSubscription() {
      cancelCurrentSubscription?.();
      cancelCurrentSubscription = null;
    }

    function disconnect() {
      disconnected = true;
      stopCurrentSubscription();
    }

    socket.on(REALTIME_LOGS_SUBSCRIBE, ({ guildId }: { guildId: string }) => {
      stopCurrentSubscription();

      let cancelled = false;
      let pendingTimer: ReturnType<typeof setTimeout> | null = null;
      const cancel = () => {
        cancelled = true;
        if (pendingTimer !== null) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
      };
      cancelCurrentSubscription = cancel;

      // このクロージャが有効な間だけtrueを返す。認証待ち/poll待ちの間に
      // unsubscribe・再subscribe・disconnectが起きた場合は、これ以降の
      // emit/pollを行わないためのガード。
      const active = () => !disconnected && !cancelled;

      void (async () => {
        try {
          const result = await deps.authenticate(guildId, socket.handshake.headers);
          if (!active()) return;

          if (!result.ok) {
            socket.emit(REALTIME_LOGS_ERROR, { reason: result.reason });
            return;
          }

          let lastId = "$";
          while (active()) {
            const { messages, nextId } = await deps.poll(guildId, lastId);
            lastId = nextId;
            if (!active()) return;

            for (const message of messages) {
              if (!active()) return;

              const payload: RealtimeLogEventPayload = {
                id: message.id,
                eventName: message.eventName,
                actorId: message.actorId,
                channelId: message.channelId,
                messageId: message.messageId,
                eventTimestamp: message.eventTimestamp.toISOString(),
                receivedAt: message.receivedAt.toISOString(),
                payload: result.canViewRaw ? (message.payload as Record<string, unknown>) : null
              };
              socket.emit(REALTIME_LOGS_EVENT, payload);
            }

            if (!active()) return;

            await new Promise<void>((resolve) => {
              pendingTimer = setTimeout(resolve, deps.pollIntervalMs);
            });
            pendingTimer = null;
          }
        } catch (error) {
          // auth/poll例外を握り潰さず記録する。未処理rejectionを防ぎつつ、
          // 既にcancel/disconnect済みの購読へは通知しない。
          console.error("[realtime-logs] subscription failed", { guildId, error });
        } finally {
          if (cancelCurrentSubscription === cancel) {
            cancelCurrentSubscription = null;
          }
        }
      })();
    });

    socket.on(REALTIME_LOGS_UNSUBSCRIBE, stopCurrentSubscription);
    socket.on("disconnect", disconnect);
  };
}

export interface RealtimeServerDeps {
  nextAuthSecret: string;
  botToken: string;
  getDb: () => DbClient;
  getRedisClient: () => Promise<XReadClient>;
  getCacheClient: () => Promise<DashboardAccessCacheClient>;
  pollIntervalMs?: number;
}

export function attachRealtimeServer(httpServer: HttpServer, deps: RealtimeServerDeps): SocketIOServer {
  const io = new SocketIOServer(httpServer, { path: "/socket.io" });

  const handler = createRealtimeLogsConnectionHandler({
    pollIntervalMs: deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    authenticate: async (guildId, headers) =>
      authenticateRealtimeSubscriptionDefault({
        headers,
        guildId,
        nextAuthSecret: deps.nextAuthSecret,
        botToken: deps.botToken,
        db: deps.getDb(),
        cache: await deps.getCacheClient()
      }),
    poll: async (guildId, lastId) =>
      pollRealtimeLogStreamDefault(await deps.getRedisClient(), guildId, lastId)
  });

  io.on("connection", handler);

  return io;
}
