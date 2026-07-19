import type { NormalizedEvent } from "@sm-bot/shared";
import type { GuildMember, PartialGuildMember } from "discord.js";

import { diffRecord, memberPayload } from "./payloads.js";

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

  const now = new Date();
  return {
    eventName: "member.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newMember.guild.id,
    actorId: newMember.id,
    channelId: null,
    messageId: null,
    payload: { before, after, changes }
  };
}
