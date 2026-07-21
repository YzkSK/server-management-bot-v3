import type { NormalizedEvent } from "@sm-bot/shared";
import {
  AuditLogEvent,
  type GuildTextBasedChannel,
  type Message,
  type PartialMessage,
  type ReadonlyCollection
} from "discord.js";

import { applyAuditLog, lookupAuditLog } from "./audit-log.js";
import {
  normalizeMessageBulkDelete,
  normalizeMessageCreate,
  normalizeMessageDelete,
  normalizeMessageUpdate,
  shouldSkipMessageLog
} from "./message-events.js";

export interface MessageLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
  /** テスト用: 監査ログ未検出時の再試行回数/間隔を上書きする。未指定時はlookupAuditLogの既定値を使う。 */
  auditLogRetries?: number;
  auditLogRetryDelayMs?: number;
}

export interface MessageLogHandlers {
  onMessageCreate: (message: Message) => Promise<void>;
  onMessageUpdate: (
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) => Promise<void>;
  onMessageDelete: (message: Message | PartialMessage) => Promise<void>;
  onMessageBulkDelete: (
    messages: ReadonlyCollection<string, Message | PartialMessage>,
    channel: GuildTextBasedChannel
  ) => Promise<void>;
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
      if (shouldSkipMessageLog(oldMessage) || shouldSkipMessageLog(newMessage)) {
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
    },

    async onMessageBulkDelete(messages, channel) {
      const event = normalizeMessageBulkDelete(messages, channel);
      // targetIdはchannelIdであり操作固有ではないため、同一チャンネルで短時間に複数のbulk
      // deleteが発生すると誤った操作の監査ログに相関しかねない。件数が一致する監査ログに
      // 絞り込み、なお候補が複数残る(=どちらか特定できない)場合はactorId/reasonを補完しない。
      const auditLog = await lookupAuditLog(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id, {
        referenceTime: event.eventTimestamp,
        entryFilter: (entry) => extractAuditLogEntryCount(entry.extra) === messages.size,
        requireUnique: true,
        ...(deps.auditLogRetries !== undefined ? { retries: deps.auditLogRetries } : {}),
        ...(deps.auditLogRetryDelayMs !== undefined ? { retryDelayMs: deps.auditLogRetryDelayMs } : {})
      });
      const correlated = applyAuditLog(event, auditLog);
      await writeSafely(deps, {
        ...correlated,
        payload: { ...correlated.payload, reason: auditLog.reason }
      });
    }
  };
}

function extractAuditLogEntryCount(extra: unknown): number | null {
  if (!extra || typeof extra !== "object" || !("count" in extra)) {
    return null;
  }

  const count = (extra as { count?: unknown }).count;
  return typeof count === "number" ? count : null;
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
