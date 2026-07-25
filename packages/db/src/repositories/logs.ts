import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, like, lt, or } from "drizzle-orm";
import type { NormalizedEvent } from "@sm-bot/shared";

import type { DbClient } from "../client.js";
import { logs } from "../schema/index.js";

export interface InsertLogEventInput
  extends Pick<NormalizedEvent, "eventName" | "eventTimestamp" | "payload"> {
  guildId?: string | null;
  actorId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  receivedAt?: Date;
  realtimeEnabled?: boolean;
}

export async function insertLogEvent(
  db: DbClient,
  input: InsertLogEventInput
) {
  const [log] = await db
    .insert(logs)
    .values({
      eventName: input.eventName,
      guildId: input.guildId ?? null,
      actorId: input.actorId ?? null,
      channelId: input.channelId ?? null,
      messageId: input.messageId ?? null,
      eventTimestamp: input.eventTimestamp,
      receivedAt: input.receivedAt ?? new Date(),
      realtimeEnabled: input.realtimeEnabled ?? false,
      payload: input.payload
    })
    .returning();

  if (!log) {
    throw new Error("Failed to insert log event.");
  }

  return log;
}

export async function markLogEventStreamSynced(
  db: DbClient,
  id: string
): Promise<void> {
  await db
    .update(logs)
    .set({ streamSyncedAt: new Date() })
    .where(eq(logs.id, id));
}

export interface UnsyncedLogEvent {
  id: string;
  eventName: string;
  guildId: string | null;
  actorId: string | null;
  channelId: string | null;
  messageId: string | null;
  eventTimestamp: Date;
  receivedAt: Date;
  realtimeEnabled: boolean;
  payload: Record<string, unknown>;
}

export async function getUnsyncedLogEvents(
  db: DbClient,
  options: { limit: number; olderThanMs: number }
): Promise<UnsyncedLogEvent[]> {
  const cutoff = new Date(Date.now() - options.olderThanMs);

  const rows = await db
    .select({
      id: logs.id,
      eventName: logs.eventName,
      guildId: logs.guildId,
      actorId: logs.actorId,
      channelId: logs.channelId,
      messageId: logs.messageId,
      eventTimestamp: logs.eventTimestamp,
      receivedAt: logs.receivedAt,
      realtimeEnabled: logs.realtimeEnabled,
      payload: logs.payload
    })
    .from(logs)
    .where(and(isNull(logs.streamSyncedAt), lt(logs.receivedAt, cutoff)))
    .orderBy(asc(logs.receivedAt))
    .limit(options.limit);

  return rows as UnsyncedLogEvent[];
}

export async function deleteLogEventsOlderThan(
  db: DbClient,
  options: { cutoff: Date; limit: number }
): Promise<number> {
  // archivedAt IS NOT NULL until archive-logs-runner confirms the row was
  // written to a .json.gz archive, so retention never deletes unarchived data.
  const targetIds = db
    .select({ id: logs.id })
    .from(logs)
    .where(and(lt(logs.receivedAt, options.cutoff), isNotNull(logs.archivedAt)))
    .orderBy(asc(logs.receivedAt), asc(logs.id))
    .limit(options.limit);

  const deleted = await db
    .delete(logs)
    .where(inArray(logs.id, targetIds))
    .returning({ id: logs.id });

  return deleted.length;
}

export interface LogEventRow {
  id: string;
  eventName: string;
  guildId: string | null;
  actorId: string | null;
  channelId: string | null;
  messageId: string | null;
  eventTimestamp: Date;
  receivedAt: Date;
  realtimeEnabled: boolean;
  payload: Record<string, unknown>;
}

export interface ArchivableLogEventRow extends LogEventRow {
  streamSyncedAt: Date | null;
  archivedAt: Date | null;
}

export async function selectLogEventsOlderThan(
  db: DbClient,
  options: { cutoff: Date; limit: number; after?: { receivedAt: Date; id: string } }
): Promise<ArchivableLogEventRow[]> {
  const conditions = [lt(logs.receivedAt, options.cutoff), isNull(logs.archivedAt)];

  if (options.after) {
    const cursorFilter = or(
      gt(logs.receivedAt, options.after.receivedAt),
      and(eq(logs.receivedAt, options.after.receivedAt), gt(logs.id, options.after.id))
    );
    if (cursorFilter) {
      conditions.push(cursorFilter);
    }
  }

  const rows = await db
    .select({
      id: logs.id,
      eventName: logs.eventName,
      guildId: logs.guildId,
      actorId: logs.actorId,
      channelId: logs.channelId,
      messageId: logs.messageId,
      eventTimestamp: logs.eventTimestamp,
      receivedAt: logs.receivedAt,
      realtimeEnabled: logs.realtimeEnabled,
      payload: logs.payload,
      streamSyncedAt: logs.streamSyncedAt,
      archivedAt: logs.archivedAt
    })
    .from(logs)
    .where(and(...conditions))
    .orderBy(asc(logs.receivedAt), asc(logs.id))
    .limit(options.limit);

  return rows as ArchivableLogEventRow[];
}

export async function markLogEventsArchived(
  db: DbClient,
  ids: readonly string[]
): Promise<number> {
  if (ids.length === 0) return 0;

  const marked = await db
    .update(logs)
    .set({ archivedAt: new Date() })
    .where(inArray(logs.id, ids))
    .returning({ id: logs.id });

  return marked.length;
}

export interface ListLogEventsInput {
  guildId: string;
  eventNamePrefixes?: readonly string[] | null;
  before?: { receivedAt: Date; id: string };
  limit: number;
}

export async function listLogEvents(
  db: DbClient,
  input: ListLogEventsInput
): Promise<LogEventRow[]> {
  const conditions = [eq(logs.guildId, input.guildId)];

  if (input.eventNamePrefixes && input.eventNamePrefixes.length > 0) {
    const prefixConditions = input.eventNamePrefixes.map((prefix) =>
      like(logs.eventName, `${prefix}%`)
    );
    const prefixFilter = or(...prefixConditions);
    if (prefixFilter) {
      conditions.push(prefixFilter);
    }
  }

  if (input.before) {
    const cursorFilter = or(
      lt(logs.receivedAt, input.before.receivedAt),
      and(eq(logs.receivedAt, input.before.receivedAt), lt(logs.id, input.before.id))
    );
    if (cursorFilter) {
      conditions.push(cursorFilter);
    }
  }

  const rows = await db
    .select({
      id: logs.id,
      eventName: logs.eventName,
      guildId: logs.guildId,
      actorId: logs.actorId,
      channelId: logs.channelId,
      messageId: logs.messageId,
      eventTimestamp: logs.eventTimestamp,
      receivedAt: logs.receivedAt,
      realtimeEnabled: logs.realtimeEnabled,
      payload: logs.payload
    })
    .from(logs)
    .where(and(...conditions))
    .orderBy(desc(logs.receivedAt), desc(logs.id))
    .limit(input.limit);

  return rows as LogEventRow[];
}
