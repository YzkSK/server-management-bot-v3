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

  await Promise.all([
    deps.insertLogEvent(deps.db, { ...event, realtimeEnabled }),
    appendLogEventToStream(deps.redis, event, { realtimeEnabled }),
    realtimeEnabled
      ? appendRealtimeLogEventToStream(deps.redis, event, { realtimeEnabled })
      : Promise.resolve()
  ]);
}
