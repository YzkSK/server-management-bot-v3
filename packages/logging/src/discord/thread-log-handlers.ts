import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type AnyThreadChannel } from "discord.js";

import {
  normalizeThreadCreate,
  normalizeThreadDelete,
  normalizeThreadUpdate
} from "./thread-events.js";
import { correlateWithAuditLog } from "./audit-log.js";

export interface ThreadLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface ThreadLogHandlers {
  onThreadCreate: (thread: AnyThreadChannel, newlyCreated: boolean) => Promise<void>;
  onThreadDelete: (thread: AnyThreadChannel) => Promise<void>;
  onThreadUpdate: (oldThread: AnyThreadChannel, newThread: AnyThreadChannel) => Promise<void>;
}

export function createThreadLogHandlers(deps: ThreadLogHandlerDeps): ThreadLogHandlers {
  return {
    async onThreadCreate(thread, newlyCreated) {
      const event = normalizeThreadCreate(thread, newlyCreated);
      const correlated = await correlateWithAuditLog(
        event,
        thread.guild,
        AuditLogEvent.ThreadCreate,
        thread.id
      );
      await writeSafely(deps, correlated);
    },

    async onThreadDelete(thread) {
      const event = normalizeThreadDelete(thread);
      const correlated = await correlateWithAuditLog(
        event,
        thread.guild,
        AuditLogEvent.ThreadDelete,
        thread.id
      );
      await writeSafely(deps, correlated);
    },

    async onThreadUpdate(oldThread, newThread) {
      const event = normalizeThreadUpdate(oldThread, newThread);
      if (!event) {
        return;
      }
      const correlated = await correlateWithAuditLog(
        event,
        newThread.guild,
        AuditLogEvent.ThreadUpdate,
        newThread.id
      );
      await writeSafely(deps, correlated);
    }
  };
}

async function writeSafely(deps: ThreadLogHandlerDeps, event: NormalizedEvent): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("thread-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
