// Client -> Server: 指定guildIdのログをsubscribeする。payload: { guildId: string }
export const REALTIME_LOGS_SUBSCRIBE = "realtimeLogsSubscribe";

// Client -> Server: subscribeを止める。payloadなし。
export const REALTIME_LOGS_UNSUBSCRIBE = "realtimeLogsUnsubscribe";

// Server -> Client: 新規ログイベント1件。payload: RealtimeLogEventPayload
export const REALTIME_LOGS_EVENT = "realtimeLogsEvent";

// Server -> Client: subscribe要求の認証・認可に成功した直後、ポーリング開始前に1回だけ送る。
// payloadなし。ログが無いguildでも「connecting」状態から復帰できるようにするためのack。
export const REALTIME_LOGS_SUBSCRIBED = "realtimeLogsSubscribed";

// Server -> Client: subscribe要求が拒否された。payload: { reason: RealtimeLogsErrorReason }
export const REALTIME_LOGS_ERROR = "realtimeLogsError";

export const REALTIME_LOGS_ERROR_REASONS = [
  "unauthenticated",
  "forbidden"
] as const;

export type RealtimeLogsErrorReason = (typeof REALTIME_LOGS_ERROR_REASONS)[number];

export interface RealtimeLogEventPayload {
  id: string;
  eventName: string;
  actorId: string | null;
  channelId: string | null;
  messageId: string | null;
  eventTimestamp: string;
  receivedAt: string;
  payload: Record<string, unknown> | null;
}
