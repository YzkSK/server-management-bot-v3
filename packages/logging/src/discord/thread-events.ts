import type { NormalizedEvent } from "@sm-bot/shared";
import type { AnyThreadChannel } from "discord.js";

import { diffRecord, threadPayload } from "./payloads.js";

export function normalizeThreadCreate(
  thread: AnyThreadChannel,
  newlyCreated: boolean
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "thread.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: thread.guildId,
    actorId: null,
    channelId: thread.id,
    messageId: null,
    payload: { thread: threadPayload(thread), newlyCreated }
  };
}

export function normalizeThreadUpdate(
  oldThread: AnyThreadChannel,
  newThread: AnyThreadChannel
): NormalizedEvent | null {
  const before = threadPayload(oldThread);
  const after = threadPayload(newThread);
  const changes = diffRecord(before, after);

  if (Object.keys(changes).length === 0) {
    return null;
  }

  const now = new Date();
  return {
    eventName: "thread.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newThread.guildId,
    actorId: null,
    channelId: newThread.id,
    messageId: null,
    payload: { before, after, changes }
  };
}

export function normalizeThreadDelete(thread: AnyThreadChannel): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "thread.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: thread.guildId,
    actorId: null,
    channelId: thread.id,
    messageId: null,
    payload: { thread: threadPayload(thread) }
  };
}
