import type { DbClient, getGuildLogMode, insertLogEvent, upsertGuild } from "@sm-bot/db";
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
  upsertGuild: typeof upsertGuild;
}

// PostgreSQLのforeign_key_violationエラーコード。
const FOREIGN_KEY_VIOLATION_CODE = "23503";

function hasPgErrorCode(err: unknown): err is { code: unknown } {
  return typeof err === "object" && err !== null && "code" in err;
}

function getCause(err: unknown): unknown {
  if (typeof err !== "object" || err === null || !("cause" in err)) {
    return undefined;
  }
  return (err as { cause?: unknown }).cause;
}

// bot起動直後、GuildCreateハンドラのguilds upsertが非同期のfire-and-forgetのため、
// upsert完了前に同一guildのmessage系イベントが届きlogs.guild_idのFK制約に違反することがある
// (issue #102)。その場合のみguildをupsertして1回だけ再試行する。
// drizzle-orm(postgres-js)はドライバのエラーをDrizzleQueryErrorでラップし、実際のPostgres
// エラーコードは`err.cause.code`に入るため、トップレベルとcause両方を確認する。
function isForeignKeyViolation(err: unknown): boolean {
  if (hasPgErrorCode(err) && err.code === FOREIGN_KEY_VIOLATION_CODE) {
    return true;
  }
  const cause = getCause(err);
  return hasPgErrorCode(cause) && cause.code === FOREIGN_KEY_VIOLATION_CODE;
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
  try {
    await deps.insertLogEvent(deps.db, { ...eventToPersist, realtimeEnabled });
  } catch (err) {
    if (!eventToPersist.guildId || !isForeignKeyViolation(err)) {
      throw err;
    }
    await deps.upsertGuild(deps.db, eventToPersist.guildId);
    await deps.insertLogEvent(deps.db, { ...eventToPersist, realtimeEnabled });
  }

  await Promise.all([
    appendLogEventToStream(deps.redis, eventToPersist, { realtimeEnabled }),
    realtimeEnabled
      ? appendRealtimeLogEventToStream(deps.redis, eventToPersist, { realtimeEnabled })
      : Promise.resolve()
  ]);
}
