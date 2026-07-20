import {
  toRealtimeLogMessage,
  type RedisStreamMessage
} from "./log-stream.js";

const DEFAULT_BLOCK_MS = 5000;
const DEFAULT_READ_COUNT = 25;
const DEFAULT_PENDING_RECOVERY_COUNT = 100;
const NEW_MESSAGES_ONLY_START_ID = "$";
const BUSYGROUP_ERROR_PREFIX = "BUSYGROUP";

export interface RedisStreamGroupClient {
  xGroupCreate: (
    key: string,
    group: string,
    id: string,
    options?: { MKSTREAM?: true }
  ) => Promise<string>;
  xReadGroup: (
    group: string,
    consumer: string,
    streams: Array<{ key: string; id: string }>,
    options?: { BLOCK?: number; COUNT?: number }
  ) => Promise<Array<{ name: string; messages: RedisStreamMessage[] }> | null>;
  xAck: (
    key: string,
    group: string,
    id: string | string[]
  ) => Promise<number>;
  xPendingRange: (
    key: string,
    group: string,
    start: string,
    end: string,
    count: number,
    options?: { IDLE?: number }
  ) => Promise<
    Array<{
      id: string;
      owner: string;
      millisecondsSinceLastDelivery: number;
      deliveriesCounter: number;
    }>
  >;
  xClaim: (
    key: string,
    group: string,
    consumer: string,
    minIdleTime: number,
    id: string | string[]
  ) => Promise<RedisStreamMessage[] | null>;
}

export async function ensureLogStreamConsumerGroup(
  redis: RedisStreamGroupClient,
  streamKey: string,
  groupName: string,
  options: { startId?: string } = {}
): Promise<void> {
  try {
    await redis.xGroupCreate(
      streamKey,
      groupName,
      options.startId ?? NEW_MESSAGES_ONLY_START_ID,
      { MKSTREAM: true }
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(BUSYGROUP_ERROR_PREFIX)) {
      return;
    }

    throw err;
  }
}

export async function readLogEventsAsConsumer(
  redis: RedisStreamGroupClient,
  streamKey: string,
  groupName: string,
  consumerName: string,
  options: { blockMs?: number; count?: number } = {}
) {
  const result = await redis.xReadGroup(
    groupName,
    consumerName,
    [{ key: streamKey, id: ">" }],
    {
      BLOCK: options.blockMs ?? DEFAULT_BLOCK_MS,
      COUNT: options.count ?? DEFAULT_READ_COUNT
    }
  );

  return (
    result?.flatMap((stream) => stream.messages.map(toRealtimeLogMessage)) ?? []
  );
}

export async function ackLogEvents(
  redis: RedisStreamGroupClient,
  streamKey: string,
  groupName: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  return redis.xAck(streamKey, groupName, ids);
}

export async function recoverPendingLogEvents(
  redis: RedisStreamGroupClient,
  streamKey: string,
  groupName: string,
  consumerName: string,
  options: { minIdleTimeMs?: number; count?: number } = {}
) {
  const minIdleTimeMs = options.minIdleTimeMs ?? DEFAULT_BLOCK_MS;
  const count = options.count ?? DEFAULT_PENDING_RECOVERY_COUNT;

  const pendingEntries = await redis.xPendingRange(
    streamKey,
    groupName,
    "-",
    "+",
    count,
    { IDLE: minIdleTimeMs }
  );

  // 自分自身が現在処理中のエントリまで奪い直すと二重処理になるため、
  // 他コンシューマ(クラッシュした旧インスタンス等)が持つ分だけを回収対象にする。
  const staleEntries = pendingEntries.filter(
    (entry) => entry.owner !== consumerName
  );

  if (staleEntries.length === 0) {
    return [];
  }

  const claimed = await redis.xClaim(
    streamKey,
    groupName,
    consumerName,
    minIdleTimeMs,
    staleEntries.map((entry) => entry.id)
  );

  return claimed?.map(toRealtimeLogMessage) ?? [];
}
