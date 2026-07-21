import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type Guild, type GuildAuditLogsEntry } from "discord.js";

import {
  DEDICATED_AUDIT_LOG_ACTIONS,
  normalizeAuditLogEntry,
  normalizeAuditLogMessageDelete
} from "./audit-log-entry-events.js";

export interface AuditLogEntryLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface AuditLogEntryLogHandlers {
  onAuditLogEntryCreate: (entry: GuildAuditLogsEntry, guild: Guild) => Promise<void>;
}

export function createAuditLogEntryLogHandlers(
  deps: AuditLogEntryLogHandlerDeps
): AuditLogEntryLogHandlers {
  return {
    async onAuditLogEntryCreate(entry, guild) {
      if (entry.action === AuditLogEvent.MessageDelete) {
        await writeSafely(deps, normalizeAuditLogMessageDelete(entry, guild));
        return;
      }

      if (DEDICATED_AUDIT_LOG_ACTIONS.has(entry.action)) {
        return;
      }

      await writeSafely(deps, normalizeAuditLogEntry(entry, guild));
    }
  };
}

async function writeSafely(
  deps: AuditLogEntryLogHandlerDeps,
  event: NormalizedEvent
): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("audit-log-entry-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
