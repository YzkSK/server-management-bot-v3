import type {
  Guild,
  GuildMember,
  NonThreadGuildBasedChannel,
  PartialGuildMember,
  PartialUser,
  Role,
  User
} from "discord.js";

export function diffRecord(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { before: before[key], after: after[key] };
    }
  }

  return changes;
}

export function guildPayload(guild: Guild) {
  return {
    id: guild.id,
    name: guild.name,
    description: guild.description,
    ownerId: guild.ownerId,
    preferredLocale: guild.preferredLocale,
    verificationLevel: guild.verificationLevel,
    premiumTier: guild.premiumTier
  };
}

export function userPayload(user: User | PartialUser) {
  return {
    id: user.id,
    username: user.username ?? null,
    globalName: user.globalName ?? null,
    bot: user.bot ?? null
  };
}

export function memberPayload(member: GuildMember | PartialGuildMember) {
  return {
    id: member.id,
    displayName: member.displayName,
    nickname: member.nickname,
    user: member.user ? userPayload(member.user) : null,
    roles: [...member.roles.cache.keys()].sort(),
    pending: member.pending ?? null,
    communicationDisabledUntil: member.communicationDisabledUntil?.toISOString() ?? null
  };
}

export function rolePayload(role: Role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    position: role.position,
    managed: role.managed,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString()
  };
}

export function channelPermissionOverwritesPayload(channel: NonThreadGuildBasedChannel) {
  return [...channel.permissionOverwrites.cache.values()]
    .map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type as number,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function channelPayload(channel: NonThreadGuildBasedChannel) {
  return {
    id: channel.id,
    guildId: channel.guildId,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId,
    position: channel.position,
    rateLimitPerUser:
      "rateLimitPerUser" in channel ? (channel.rateLimitPerUser as number | null) : null,
    permissionOverwrites: channelPermissionOverwritesPayload(channel)
  };
}
