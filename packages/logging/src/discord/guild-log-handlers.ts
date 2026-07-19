import type { NormalizedEvent } from "@sm-bot/shared";
import type { Guild } from "discord.js";

import { normalizeGuildUpdate } from "./guild-events.js";

export interface GuildLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface GuildLogHandlers {
  onGuildUpdate: (oldGuild: Guild, newGuild: Guild) => Promise<void>;
}

export function createGuildLogHandlers(deps: GuildLogHandlerDeps): GuildLogHandlers {
  return {
    async onGuildUpdate(oldGuild, newGuild) {
      const event = normalizeGuildUpdate(oldGuild, newGuild);
      if (!event) {
        return;
      }
      await writeSafely(deps, event);
    }
  };
}

async function writeSafely(deps: GuildLogHandlerDeps, event: NormalizedEvent): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("guild-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
