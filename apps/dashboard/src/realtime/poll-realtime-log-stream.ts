import {
  REALTIME_LOGS_STREAM_PREFIX,
  toRealtimeLogMessage,
  type RedisStreamMessage
} from "@sm-bot/logging";

const DEFAULT_BLOCK_MS = 5000;
const DEFAULT_COUNT = 25;

export interface XReadClient {
  xRead: (
    streams: Array<{ key: string; id: string }>,
    options?: { BLOCK?: number; COUNT?: number }
  ) => Promise<Array<{ name: string; messages: RedisStreamMessage[] }> | null>;
}

export async function pollRealtimeLogStream(
  redis: XReadClient,
  guildId: string,
  lastId: string,
  options: { blockMs?: number; count?: number } = {}
) {
  const result = await redis.xRead(
    [{ key: `${REALTIME_LOGS_STREAM_PREFIX}${guildId}`, id: lastId }],
    { BLOCK: options.blockMs ?? DEFAULT_BLOCK_MS, COUNT: options.count ?? DEFAULT_COUNT }
  );

  const rawMessages = result?.flatMap((stream) => stream.messages) ?? [];
  if (rawMessages.length === 0) {
    return { messages: [], nextId: lastId };
  }

  return {
    messages: rawMessages.map(toRealtimeLogMessage),
    nextId: rawMessages[rawMessages.length - 1]!.id
  };
}
