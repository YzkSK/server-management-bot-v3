import type { NormalizedEvent } from "@sm-bot/shared";
import type { Invite } from "discord.js";

import type { CachedInvite } from "./invite-cache.js";
import { invitePayload, userPayload } from "./payloads.js";

export function normalizeInviteCreate(invite: Invite): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "invite.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: invite.guild?.id ?? null,
    actorId: invite.inviter?.id ?? null,
    channelId: invite.channel?.id ?? null,
    messageId: null,
    payload: {
      invite: invitePayload(invite),
      inviter: invite.inviter ? userPayload(invite.inviter) : null
    }
  };
}

export function normalizeInviteDelete(
  invite: Invite,
  cached: CachedInvite | null
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "invite.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: invite.guild?.id ?? null,
    // actorIdは削除者を表すため、招待作成者(inviter)をフォールバックにしない。
    // 削除者はAudit Log相関(correlateWithAuditLog)でのみ補完する。
    actorId: null,
    channelId: invite.channel?.id ?? null,
    messageId: null,
    payload: {
      invite: invitePayload(invite, cached),
      inviter: invite.inviter ? userPayload(invite.inviter) : null
    }
  };
}
