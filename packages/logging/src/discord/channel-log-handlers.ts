import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type DMChannel, type NonThreadGuildBasedChannel } from "discord.js";

import {
  isGuildChannel,
  normalizeChannelCreate,
  normalizeChannelDelete,
  normalizeChannelUpdate
} from "./channel-events.js";
import { correlateWithAuditLog } from "./audit-log.js";

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
      const event = normalizeChannelCreate(channel);
      const correlated = await correlateWithAuditLog(
        event,
        channel.guild,
        AuditLogEvent.ChannelCreate,
        channel.id
      );
      await writeSafely(deps, correlated);
    },

    async onChannelDelete(channel) {
      if (!isGuildChannel(channel)) {
        return;
      }
      const event = normalizeChannelDelete(channel);
      const correlated = await correlateWithAuditLog(
        event,
        channel.guild,
        AuditLogEvent.ChannelDelete,
        channel.id
      );
      await writeSafely(deps, correlated);
    },

    async onChannelUpdate(oldChannel, newChannel) {
      if (!isGuildChannel(oldChannel) || !isGuildChannel(newChannel)) {
        return;
      }
      const events = normalizeChannelUpdate(oldChannel, newChannel);
      for (const event of events) {
        // channel.permission_updateはAudit Log相関の対象外(actorId: nullのまま)。
        if (event.eventName === "channel.update") {
          const correlated = await correlateWithAuditLog(
            event,
            newChannel.guild,
            AuditLogEvent.ChannelUpdate,
            newChannel.id
          );
          await writeSafely(deps, correlated);
        } else {
          await writeSafely(deps, event);
        }
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
