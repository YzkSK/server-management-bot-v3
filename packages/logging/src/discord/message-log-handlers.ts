import type { NormalizedEvent } from "@sm-bot/shared";
import type { Message, PartialMessage } from "discord.js";

import {
  normalizeMessageCreate,
  normalizeMessageDelete,
  normalizeMessageUpdate,
  shouldSkipMessageLog
} from "./message-events.js";

export interface MessageLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface MessageLogHandlers {
  onMessageCreate: (message: Message) => Promise<void>;
  onMessageUpdate: (
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) => Promise<void>;
  onMessageDelete: (message: Message | PartialMessage) => Promise<void>;
}

export function createMessageLogHandlers(
  deps: MessageLogHandlerDeps
): MessageLogHandlers {
  return {
    async onMessageCreate(message) {
      if (shouldSkipMessageLog(message)) {
        return;
      }
      await writeSafely(deps, normalizeMessageCreate(message));
    },

    async onMessageUpdate(oldMessage, newMessage) {
      if (shouldSkipMessageLog(newMessage)) {
        return;
      }
      const event = normalizeMessageUpdate(oldMessage, newMessage);
      if (!event) {
        return;
      }
      await writeSafely(deps, event);
    },

    async onMessageDelete(message) {
      if (shouldSkipMessageLog(message)) {
        return;
      }
      await writeSafely(deps, normalizeMessageDelete(message));
    }
  };
}

async function writeSafely(
  deps: MessageLogHandlerDeps,
  event: NormalizedEvent
): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("message-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
