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
    let stopped = false;
    let stopCurrentSubscription: (() => void) | null = null;

    function stop() {
      stopped = true;
      stopCurrentSubscription?.();
      stopCurrentSubscription = null;
    }

    socket.on(REALTIME_LOGS_SUBSCRIBE, ({ guildId }: { guildId: string }) => {
      stopCurrentSubscription?.();
      let subscriptionStopped = false;
      stopCurrentSubscription = () => {
        subscriptionStopped = true;
      };

      void (async () => {
        const result = await deps.authenticate(guildId, socket.handshake.headers);
        if (!result.ok) {
          socket.emit(REALTIME_LOGS_ERROR, { reason: result.reason });
          return;
        }

        let lastId = "$";
        while (!stopped && !subscriptionStopped) {
          const { messages, nextId } = await deps.poll(guildId, lastId);
          lastId = nextId;

          for (const message of messages) {
            if (stopped || subscriptionStopped) break;

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

          if (!stopped && !subscriptionStopped) {
            await new Promise((resolve) => setTimeout(resolve, deps.pollIntervalMs));
          }
        }
      })();
    });

    socket.on(REALTIME_LOGS_UNSUBSCRIBE, stop);
    socket.on("disconnect", stop);
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
