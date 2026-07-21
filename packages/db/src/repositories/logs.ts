import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
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
  const rows = await db
    .select({ id: logs.id })
    .from(logs)
    .where(lt(logs.receivedAt, options.cutoff))
    .limit(options.limit);

  if (rows.length === 0) {
    return 0;
  }

  const deleted = await db
    .delete(logs)
    .where(
      inArray(
        logs.id,
        rows.map((row) => row.id)
      )
    )
    .returning({ id: logs.id });

  return deleted.length;
}
