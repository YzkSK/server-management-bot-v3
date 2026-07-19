import type { NormalizedEvent } from "@sm-bot/shared";
import type { GuildScheduledEvent, PartialGuildScheduledEvent, User } from "discord.js";

import { diffRecord, userPayload } from "./payloads.js";

function scheduledEventPayload(event: GuildScheduledEvent | PartialGuildScheduledEvent) {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    channelId: event.channelId,
    creatorId: event.creatorId,
    entityType: event.entityType,
    entityId: event.entityId,
    entityMetadata: event.entityMetadata,
    privacyLevel: event.privacyLevel,
    status: event.status,
    scheduledStartTimestamp: event.scheduledStartTimestamp,
    scheduledEndTimestamp: event.scheduledEndTimestamp,
    userCount: event.userCount ?? null
  };
}

export function normalizeScheduledEventCreate(event: GuildScheduledEvent): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "event.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: event.guildId,
    actorId: event.creatorId,
    channelId: event.channelId,
    messageId: null,
    payload: { event: scheduledEventPayload(event) }
  };
}

export function normalizeScheduledEventUpdate(
  oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
  newEvent: GuildScheduledEvent
): NormalizedEvent {
  const before = oldEvent ? scheduledEventPayload(oldEvent) : null;
  const after = scheduledEventPayload(newEvent);
  const now = new Date();
  return {
    eventName: "event.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newEvent.guildId,
    actorId: null,
    channelId: newEvent.channelId,
    messageId: null,
    payload: { before, after, changes: before ? diffRecord(before, after) : {} }
  };
}

export function normalizeScheduledEventDelete(
  event: GuildScheduledEvent | PartialGuildScheduledEvent
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "event.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: event.guildId,
    actorId: null,
    channelId: event.channelId,
    messageId: null,
    payload: { event: scheduledEventPayload(event) }
  };
}

export function normalizeScheduledEventUserAdd(
  event: GuildScheduledEvent | PartialGuildScheduledEvent,
  user: User
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "event.user.add",
    eventTimestamp: now,
    receivedAt: now,
    guildId: event.guildId,
    actorId: user.id,
    channelId: event.channelId,
    messageId: null,
    payload: { eventId: event.id, user: userPayload(user) }
  };
}

export function normalizeScheduledEventUserRemove(
  event: GuildScheduledEvent | PartialGuildScheduledEvent,
  user: User
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "event.user.remove",
    eventTimestamp: now,
    receivedAt: now,
    guildId: event.guildId,
    actorId: user.id,
    channelId: event.channelId,
    messageId: null,
    payload: { eventId: event.id, user: userPayload(user) }
  };
}
