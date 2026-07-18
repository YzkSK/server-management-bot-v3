import type { DbClient } from "../client.js";
import { logs } from "../schema/index.js";

export interface InsertLogEventInput {
  eventName: string;
  guildId?: string | null;
  actorId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  eventTimestamp?: Date;
  receivedAt?: Date;
  realtimeEnabled?: boolean;
  payload?: Record<string, unknown>;
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
      eventTimestamp: input.eventTimestamp ?? new Date(),
      receivedAt: input.receivedAt ?? new Date(),
      realtimeEnabled: input.realtimeEnabled ?? false,
      payload: input.payload ?? {}
    })
    .returning();

  if (!log) {
    throw new Error("Failed to insert log event.");
  }

  return log;
}
