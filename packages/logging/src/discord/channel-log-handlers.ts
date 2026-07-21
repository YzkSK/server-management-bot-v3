import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type DMChannel, type NonThreadGuildBasedChannel } from "discord.js";

import {
  isGuildChannel,
  normalizeChannelCreate,
  normalizeChannelDelete,
  normalizeChannelUpdate,
  normalizeWebhookChange,
  type WebhookChangeEventName
} from "./channel-events.js";
import { applyAuditLog, correlateWithAuditLog, lookupWebhookAuditLogAction } from "./audit-log.js";

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
  onWebhooksUpdate: (channel: NonThreadGuildBasedChannel) => Promise<void>;
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
    },

    async onWebhooksUpdate(channel) {
      // WebhooksUpdateは作成・更新・削除のいずれでも発火し、操作種別を直接示さない。
      // Audit LogのWebhookUpdateエントリのtargetIdはwebhook自体のIDであり、
      // WebhooksUpdateイベントから取得できるchannel.idとは一致しないため、
      // targetIdでの相関ではなくchannelIdの一致でWebhookCreate/Update/Deleteの
      // Audit Logエントリを探し、操作種別を判定する。
      const event = normalizeWebhookChange(channel, "webhook.update");
      const auditLog = await lookupWebhookAuditLogAction(channel.guild, channel.id, {
        referenceTime: event.eventTimestamp
      });
      const correlated = applyAuditLog(
        { ...event, eventName: webhookEventNameForAuditLogAction(auditLog.action) },
        auditLog
      );
      await writeSafely(deps, correlated);
    }
  };
}

function webhookEventNameForAuditLogAction(
  action: AuditLogEvent.WebhookCreate | AuditLogEvent.WebhookUpdate | AuditLogEvent.WebhookDelete | null
): WebhookChangeEventName {
  switch (action) {
    case AuditLogEvent.WebhookCreate:
      return "webhook.create";
    case AuditLogEvent.WebhookDelete:
      return "webhook.delete";
    default:
      return "webhook.update";
  }
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
