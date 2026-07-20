import type { DbClient, getGuildLogMode, insertLogEvent } from "@sm-bot/db";
import type { NormalizedEvent } from "@sm-bot/shared";

import {
  isLogModeControlledEvent,
  resolveLogWriteAction,
  stripMessageContent
} from "../domain/log-mode-policy.js";
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
  getGuildLogMode: typeof getGuildLogMode;
}

export async function writeLogEvent(
  deps: LogWriterDeps,
  event: NormalizedEvent
): Promise<void> {
  // logModeが影響しないイベント種別、またはguildId不明のイベント(system.*等)は
  // 無駄なDB参照を避けるためlookupをスキップしfull扱いにする。
  const logMode =
    event.guildId && isLogModeControlledEvent(event.eventName)
      ? await deps.getGuildLogMode(deps.db, event.guildId)
      : "full";
  const writeAction = resolveLogWriteAction(event.eventName, logMode);

  if (writeAction === "skip") {
    return;
  }

  const eventToPersist =
    writeAction === "write-metadata-only" ? stripMessageContent(event) : event;
  const realtimeEnabled = resolveRealtimeEnabled(eventToPersist.eventName);

  // logsテーブルへの永続化を正とするため、DB書き込みが成功してからRedis Streamに流す。
  // 先にstreamへ流すと、DB insert失敗時に「永続化されていないイベント」がstream読者に見えてしまう。
  await deps.insertLogEvent(deps.db, { ...eventToPersist, realtimeEnabled });

  await Promise.all([
    appendLogEventToStream(deps.redis, eventToPersist, { realtimeEnabled }),
    realtimeEnabled
      ? appendRealtimeLogEventToStream(deps.redis, eventToPersist, { realtimeEnabled })
      : Promise.resolve()
  ]);
}
