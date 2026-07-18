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
