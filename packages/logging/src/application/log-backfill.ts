import type {
  DbClient,
  UnsyncedLogEvent,
  getUnsyncedLogEvents,
  markLogEventStreamSynced
} from "@sm-bot/db";
import type { NormalizedEvent } from "@sm-bot/shared";

import {
  appendLogEventToStream,
  appendRealtimeLogEventToStream,
  type RedisStreamWriter
} from "./log-stream.js";

export const DEFAULT_BACKFILL_BATCH_SIZE = 100;
export const DEFAULT_BACKFILL_GRACE_PERIOD_MS = 30 * 1000;

export interface LogBackfillDeps {
  db: DbClient;
  redis: RedisStreamWriter;
  getUnsyncedLogEvents: typeof getUnsyncedLogEvents;
  markLogEventStreamSynced: typeof markLogEventStreamSynced;
}

export interface LogBackfillResult {
  synced: number;
  failed: number;
}

function toNormalizedEvent(row: UnsyncedLogEvent): NormalizedEvent {
  return {
    eventName: row.eventName,
    guildId: row.guildId,
    actorId: row.actorId,
    channelId: row.channelId,
    messageId: row.messageId,
    eventTimestamp: row.eventTimestamp,
    receivedAt: row.receivedAt,
    payload: row.payload
  };
}

export async function backfillUnsyncedLogEvents(
  deps: LogBackfillDeps,
  options: { limit?: number; olderThanMs?: number } = {}
): Promise<LogBackfillResult> {
  const limit = options.limit ?? DEFAULT_BACKFILL_BATCH_SIZE;
  const olderThanMs = options.olderThanMs ?? DEFAULT_BACKFILL_GRACE_PERIOD_MS;

  const rows = await deps.getUnsyncedLogEvents(deps.db, { limit, olderThanMs });

  if (rows.length === 0) {
    return { synced: 0, failed: 0 };
  }

  const results = await Promise.all(
    rows.map(async (row) => {
      const event = toNormalizedEvent(row);
      try {
        await Promise.all([
          appendLogEventToStream(deps.redis, event, { realtimeEnabled: row.realtimeEnabled }),
          row.realtimeEnabled
            ? appendRealtimeLogEventToStream(deps.redis, event, {
                realtimeEnabled: row.realtimeEnabled
              })
            : Promise.resolve()
        ]);
        await deps.markLogEventStreamSynced(deps.db, row.id);
        return true;
      } catch (err) {
        console.error("log-backfill: failed to re-append unsynced log event to redis stream", {
          logId: row.id,
          eventName: row.eventName,
          guildId: row.guildId,
          err
        });
        return false;
      }
    })
  );

  const synced = results.filter(Boolean).length;
  const failed = results.length - synced;

  return { synced, failed };
}
