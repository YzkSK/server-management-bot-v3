import type { NormalizedEvent } from "@sm-bot/shared";
import type { DMChannel, NonThreadGuildBasedChannel } from "discord.js";

import {
  isGuildChannel,
  normalizeChannelCreate,
  normalizeChannelDelete,
  normalizeChannelUpdate
} from "./channel-events.js";

export interface ChannelLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface ChannelLogHandlers {
  onChannelCreate: (channel: NonThreadGuildBasedChannel) => Promise<void>;
  onChannelDelete: (channel: DMChannel | NonThreadGuildBasedChannel) => Promise<void>;
  onChannelUpdate: (
    oldChannel: DMChannel | NonThreadGuildBasedChannel,
    newChannel: DMChannel | NonThreadGuildBasedChannel
  ) => Promise<void>;
}

export function createChannelLogHandlers(deps: ChannelLogHandlerDeps): ChannelLogHandlers {
  return {
    async onChannelCreate(channel) {
      await writeSafely(deps, normalizeChannelCreate(channel));
    },

    async onChannelDelete(channel) {
      if (!isGuildChannel(channel)) {
        return;
      }
      await writeSafely(deps, normalizeChannelDelete(channel));
    },

    async onChannelUpdate(oldChannel, newChannel) {
      if (!isGuildChannel(oldChannel) || !isGuildChannel(newChannel)) {
        return;
      }
      const events = normalizeChannelUpdate(oldChannel, newChannel);
      for (const event of events) {
        await writeSafely(deps, event);
      }
    }
  };
}

async function writeSafely(
  deps: ChannelLogHandlerDeps,
  event: NormalizedEvent
): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("channel-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
