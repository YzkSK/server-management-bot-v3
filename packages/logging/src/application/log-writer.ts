import type { DbClient, insertLogEvent } from "@sm-bot/db";
import type { NormalizedEvent } from "@sm-bot/shared";

import { resolveRealtimeEnabled } from "../domain/realtime-policy.js";
import {
  appendLogEventToStream,
  appendRealtimeLogEventToStream,
  type RedisStreamWriter
} from "./log-stream.js";

export interface LogWriterDeps {
  db: DbClient;
  redis: RedisStreamWriter;
  insertLogEvent: typeof insertLogEvent;
}

export async function writeLogEvent(
  deps: LogWriterDeps,
  event: NormalizedEvent
): Promise<void> {
  const realtimeEnabled = resolveRealtimeEnabled(event.eventName);

  // logsテーブルへの永続化を正とするため、DB書き込みが成功してからRedis Streamに流す。
  // 先にstreamへ流すと、DB insert失敗時に「永続化されていないイベント」がstream読者に見えてしまう。
  await deps.insertLogEvent(deps.db, { ...event, realtimeEnabled });

  await Promise.all([
    appendLogEventToStream(deps.redis, event, { realtimeEnabled }),
    realtimeEnabled
      ? appendRealtimeLogEventToStream(deps.redis, event, { realtimeEnabled })
      : Promise.resolve()
  ]);
}
