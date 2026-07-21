import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type Guild, type GuildAuditLogsEntry } from "discord.js";

/**
 * 専用のgatewayイベントハンドラが既にAudit Log相関込みで記録しているアクション。
 * ここに含まれるアクションはaudit_log.entryとして二重記録しない。
 */
export const DEDICATED_AUDIT_LOG_ACTIONS: ReadonlySet<AuditLogEvent> = new Set([
  AuditLogEvent.GuildUpdate,
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ChannelUpdate,
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.WebhookUpdate,
  AuditLogEvent.WebhookDelete,
  AuditLogEvent.MemberKick,
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberBanRemove,
  AuditLogEvent.MemberUpdate,
  AuditLogEvent.MemberRoleUpdate,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.RoleUpdate,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.InviteCreate,
  AuditLogEvent.InviteDelete,
  AuditLogEvent.EmojiCreate,
  AuditLogEvent.EmojiUpdate,
  AuditLogEvent.EmojiDelete,
  AuditLogEvent.StickerCreate,
  AuditLogEvent.StickerUpdate,
  AuditLogEvent.StickerDelete,
  AuditLogEvent.ThreadCreate,
  AuditLogEvent.ThreadUpdate,
  AuditLogEvent.ThreadDelete,
  AuditLogEvent.AutoModerationRuleCreate,
  AuditLogEvent.AutoModerationRuleUpdate,
  AuditLogEvent.AutoModerationRuleDelete,
  AuditLogEvent.AutoModerationBlockMessage,
  AuditLogEvent.AutoModerationFlagToChannel,
  AuditLogEvent.AutoModerationUserCommunicationDisabled,
  AuditLogEvent.GuildScheduledEventCreate,
  AuditLogEvent.GuildScheduledEventUpdate,
  AuditLogEvent.GuildScheduledEventDelete,
  AuditLogEvent.StageInstanceCreate,
  AuditLogEvent.StageInstanceUpdate,
  AuditLogEvent.StageInstanceDelete,
  AuditLogEvent.IntegrationCreate,
  AuditLogEvent.IntegrationUpdate,
  AuditLogEvent.IntegrationDelete,
  AuditLogEvent.MessageBulkDelete
]);

/**
 * MessageDeleteのAudit Logエントリから、削除実行者(モデレーター)視点のmessage.deleteを記録する。
 * gatewayのMessageDeleteイベント(message-events.ts)は投稿者視点かつキャッシュ依存のため、
 * 他人のメッセージを削除した操作はこちらでのみ捕捉できる。source: "audit_log"で判別できるようにする。
 */
export function normalizeAuditLogMessageDelete(
  entry: GuildAuditLogsEntry,
  guild: Guild
): NormalizedEvent {
  const extra = entry.extra;

  return {
    eventName: "message.delete",
    eventTimestamp: entry.createdAt,
    receivedAt: new Date(),
    guildId: guild.id,
    actorId: entry.executorId,
    channelId: extractMessageDeleteChannelId(extra),
    messageId: null,
    payload: {
      source: "audit_log",
      auditLogEntryId: entry.id,
      content: null,
      attachments: [],
      partial: true,
      targetUserId: entry.targetId,
      count: extractExtraCount(extra),
      reason: entry.reason
    }
  };
}

export function normalizeAuditLogEntry(entry: GuildAuditLogsEntry, guild: Guild): NormalizedEvent {
  return {
    eventName: "audit_log.entry",
    eventTimestamp: entry.createdAt,
    receivedAt: new Date(),
    guildId: guild.id,
    actorId: entry.executorId,
    channelId: null,
    messageId: null,
    payload: {
      id: entry.id,
      action: entry.action,
      targetId: entry.targetId,
      targetName: extractTargetName(entry.target),
      reason: entry.reason,
      changes: entry.changes
    }
  };
}

function extractMessageDeleteChannelId(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || !("channel" in extra)) {
    return null;
  }

  const channel = (extra as { channel?: unknown }).channel;
  if (!channel || typeof channel !== "object" || !("id" in channel)) {
    return null;
  }

  const id = (channel as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function extractExtraCount(extra: unknown): number | null {
  if (!extra || typeof extra !== "object" || !("count" in extra)) {
    return null;
  }

  const count = (extra as { count?: unknown }).count;
  return typeof count === "number" ? count : null;
}

function extractTargetName(target: unknown): string | null {
  if (!target || typeof target !== "object") {
    return null;
  }

  const t = target as Record<string, unknown>;
  if (typeof t.globalName === "string") {
    return t.globalName;
  }
  if (typeof t.username === "string") {
    return t.username;
  }
  if (typeof t.name === "string") {
    return t.name;
  }
  return null;
}
