import type { NormalizedEvent } from "@sm-bot/shared";
import type { GuildScheduledEvent, PartialGuildScheduledEvent, User } from "discord.js";

import {
  normalizeScheduledEventCreate,
  normalizeScheduledEventDelete,
  normalizeScheduledEventUpdate,
  normalizeScheduledEventUserAdd,
  normalizeScheduledEventUserRemove
} from "./scheduled-event-events.js";

export interface ScheduledEventLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface ScheduledEventLogHandlers {
  onScheduledEventCreate: (event: GuildScheduledEvent) => Promise<void>;
  onScheduledEventUpdate: (
    oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
    newEvent: GuildScheduledEvent
  ) => Promise<void>;
  onScheduledEventDelete: (event: GuildScheduledEvent | PartialGuildScheduledEvent) => Promise<void>;
  onScheduledEventUserAdd: (
    event: GuildScheduledEvent | PartialGuildScheduledEvent,
    user: User
  ) => Promise<void>;
  onScheduledEventUserRemove: (
    event: GuildScheduledEvent | PartialGuildScheduledEvent,
    user: User
  ) => Promise<void>;
}

export function createScheduledEventLogHandlers(
  deps: ScheduledEventLogHandlerDeps
): ScheduledEventLogHandlers {
  return {
    async onScheduledEventCreate(event) {
      await writeSafely(deps, normalizeScheduledEventCreate(event));
    },

    async onScheduledEventUpdate(oldEvent, newEvent) {
      await writeSafely(deps, normalizeScheduledEventUpdate(oldEvent, newEvent));
    },

    async onScheduledEventDelete(event) {
      await writeSafely(deps, normalizeScheduledEventDelete(event));
    },

    async onScheduledEventUserAdd(event, user) {
      await writeSafely(deps, normalizeScheduledEventUserAdd(event, user));
    },

    async onScheduledEventUserRemove(event, user) {
      await writeSafely(deps, normalizeScheduledEventUserRemove(event, user));
    }
  };
}

async function writeSafely(
  deps: ScheduledEventLogHandlerDeps,
  event: NormalizedEvent
): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("scheduled-event-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
