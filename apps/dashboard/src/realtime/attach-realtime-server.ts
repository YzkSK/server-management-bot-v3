import type { Server as HttpServer } from "node:http";

import type { DashboardAccessCacheClient } from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";
import {
  REALTIME_LOGS_ERROR,
  REALTIME_LOGS_EVENT,
  REALTIME_LOGS_SUBSCRIBE,
  REALTIME_LOGS_SUBSCRIBED,
  REALTIME_LOGS_UNSUBSCRIBE,
  type RealtimeLogEventPayload,
  type RealtimeLogsErrorReason
} from "@sm-bot/shared";
import { Server as SocketIOServer, type Socket } from "socket.io";

import {
  authenticateRealtimeSubscription as authenticateRealtimeSubscriptionDefault
} from "./authenticate-realtime-subscription.ts";
import {
  pollRealtimeLogStream as pollRealtimeLogStreamDefault,
  type XReadClient
} from "./poll-realtime-log-stream.ts";

const DEFAULT_POLL_INTERVAL_MS = 250;

export interface ConnectionHandlerDeps {
  authenticate: (guildId: string, headers: Record<string, string | string[] | undefined>) => Promise<
    { ok: true; userId: string; canViewRaw: boolean } | { ok: false; reason: RealtimeLogsErrorReason }
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

    socket.on(REALTIME_LOGS_SUBSCRIBE, (payload: unknown) => {
      if (
        typeof payload !== "object" ||
        payload === null ||
        typeof (payload as { guildId?: unknown }).guildId !== "string" ||
        (payload as { guildId: string }).guildId.length === 0
      ) {
        // 不正なpayload(未指定・非オブジェクト・空guildId)は購読を開始せず、
        // 破棄しつつクライアントにforbiddenを通知する。ここでdestructureして
        // 例外を投げるとsocket.io内部のイベントディスパッチ(process.nextTick内)で
        // 未捕捉例外となり、プロセス全体をクラッシュさせ得るため必ずガードする。
        socket.emit(REALTIME_LOGS_ERROR, { reason: "forbidden" });
        return;
      }
      const { guildId } = payload as { guildId: string };

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

          // 認証・認可に成功した時点でackを送る。ログ活動が無いguildでも
          // クライアントが「connecting」のまま止まらないようにするため
          // (実ログイベントの到着を待たずにlive状態へ遷移できる)。
          socket.emit(REALTIME_LOGS_SUBSCRIBED);

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
          if (active()) {
            socket.emit(REALTIME_LOGS_ERROR, { reason: "internal" });
          }
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

export interface DuplicableXReadClient extends XReadClient {
  duplicate: () => DuplicableXReadClient;
  connect: () => Promise<unknown>;
  on: (event: "error", listener: (error: unknown) => void) => unknown;
}

export interface RealtimeServerDeps {
  nextAuthSecret: string;
  botToken: string;
  getDb: () => DbClient;
  getRedisClient: () => Promise<DuplicableXReadClient>;
  getCacheClient: () => Promise<DashboardAccessCacheClient>;
  pollIntervalMs?: number;
}

export function attachRealtimeServer(httpServer: HttpServer, deps: RealtimeServerDeps): SocketIOServer {
  const io = new SocketIOServer(httpServer, { path: "/socket.io" });

  // pollのXREAD BLOCKは認可キャッシュ用の共有Redis接続を専有すると
  // 並行閲覧時にダッシュボード全体のRedis利用を遅延させるため、
  // guildごとに複製した専用接続で実行する(guild単位の共有は許容: 同一guildへの
  // 複数閲覧は元々1本のポーリングに集約する設計上の既知の制約で、別issueでの
  // fan-out化対象。異なるguild間でXREAD BLOCKが直列化される問題のみをここで解消する)。
  const pollClientsByGuild = new Map<string, Promise<XReadClient>>();
  function getPollRedisClient(guildId: string): Promise<XReadClient> {
    let clientPromise = pollClientsByGuild.get(guildId);
    if (!clientPromise) {
      clientPromise = (async () => {
        const isolated = (await deps.getRedisClient()).duplicate();
        // duplicate()は複製元に設定済みのerrorリスナーを引き継がないため、
        // ここで付けないとRedis障害時にプロセス全体を落としかねない。
        isolated.on("error", (error) => {
          console.error("[realtime-logs] poll redis client error", { guildId, error });
        });
        await isolated.connect();
        return isolated;
      })();
      clientPromise.catch(() => {
        // 接続確立に失敗したPromiseを永続キャッシュしない。次回subscribeで再接続を試みる。
        if (pollClientsByGuild.get(guildId) === clientPromise) {
          pollClientsByGuild.delete(guildId);
        }
      });
      pollClientsByGuild.set(guildId, clientPromise);
    }
    return clientPromise;
  }

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
      pollRealtimeLogStreamDefault(await getPollRedisClient(guildId), guildId, lastId)
  });

  io.on("connection", handler);

  return io;
}
