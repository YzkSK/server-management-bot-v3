import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type Guild } from "discord.js";

import { normalizeGuildUpdate } from "./guild-events.js";
import { correlateWithAuditLog } from "./audit-log.js";
import { writeSafely } from "./write-safely.js";

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
      const correlated = await correlateWithAuditLog(
        event,
        newGuild,
        AuditLogEvent.GuildUpdate,
        newGuild.id
      );
      await writeSafely(deps, correlated, "guild-log-handlers");
    }
  };
}
