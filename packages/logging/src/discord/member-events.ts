import type { NormalizedEvent } from "@sm-bot/shared";
import type { GuildBan, GuildMember, PartialGuildMember } from "discord.js";

import { diffRecord, memberPayload, userPayload } from "./payloads.js";

export function normalizeMemberJoin(member: GuildMember): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "member.join",
    eventTimestamp: now,
    receivedAt: now,
    guildId: member.guild.id,
    actorId: member.id,
    channelId: null,
    messageId: null,
    payload: {
      member: memberPayload(member)
    }
  };
}

export function normalizeMemberLeave(
  member: GuildMember | PartialGuildMember
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "member.leave",
    eventTimestamp: now,
    receivedAt: now,
    guildId: member.guild.id,
    actorId: member.id,
    channelId: null,
    messageId: null,
    payload: {
      member: memberPayload(member)
    }
  };
}

export function normalizeMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
): NormalizedEvent | null {
  const before = memberPayload(oldMember);
  const after = memberPayload(newMember);
  const changes = diffRecord(before, after);

  if (Object.keys(changes).length === 0) {
    return null;
  }

  const oldTimeout = oldMember.communicationDisabledUntil?.toISOString() ?? null;
  const newTimeout = newMember.communicationDisabledUntil?.toISOString() ?? null;
  const eventName = oldTimeout !== newTimeout ? "member.timeout" : "member.update";

  const now = new Date();
  return {
    eventName,
    eventTimestamp: now,
    receivedAt: now,
    guildId: newMember.guild.id,
    actorId: newMember.id,
    channelId: null,
    messageId: null,
    payload: { before, after, changes }
  };
}

export function normalizeMemberBan(ban: GuildBan): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "member.ban",
    eventTimestamp: now,
    receivedAt: now,
    guildId: ban.guild.id,
    actorId: ban.user.id,
    channelId: null,
    messageId: null,
    payload: {
      user: userPayload(ban.user),
      reason: ban.reason
    }
  };
}

export function normalizeMemberUnban(ban: GuildBan): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "member.unban",
    eventTimestamp: now,
    receivedAt: now,
    guildId: ban.guild.id,
    actorId: ban.user.id,
    channelId: null,
    messageId: null,
    payload: {
      user: userPayload(ban.user),
      reason: ban.reason
    }
  };
}
