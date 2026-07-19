import type { NormalizedEvent } from "@sm-bot/shared";
import type { Role } from "discord.js";

import { diffRecord, rolePayload } from "./payloads.js";

export function normalizeRoleCreate(role: Role): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "role.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: role.guild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { role: rolePayload(role) }
  };
}

export function normalizeRoleDelete(role: Role): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "role.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: role.guild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { role: rolePayload(role) }
  };
}

export function normalizeRoleUpdate(oldRole: Role, newRole: Role): NormalizedEvent | null {
  const before = rolePayload(oldRole);
  const after = rolePayload(newRole);
  const changes = diffRecord(before, after);

  if (Object.keys(changes).length === 0) {
    return null;
  }

  const now = new Date();
  return {
    eventName: "role.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newRole.guild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { before, after, changes }
  };
}
