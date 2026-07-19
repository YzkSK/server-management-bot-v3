import type {
  AnyThreadChannel,
  Guild,
  GuildEmoji,
  GuildMember,
  Invite,
  NonThreadGuildBasedChannel,
  PartialGuildMember,
  PartialUser,
  Role,
  Sticker,
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

export function threadPayload(thread: AnyThreadChannel) {
  return {
    id: thread.id,
    guildId: thread.guildId,
    name: thread.name,
    type: thread.type,
    parentId: thread.parentId,
    ownerId: thread.ownerId,
    archived: thread.archived,
    locked: thread.locked,
    invitable: thread.invitable ?? null,
    autoArchiveDuration: thread.autoArchiveDuration,
    rateLimitPerUser: thread.rateLimitPerUser
  };
}

interface CachedInviteLike {
  maxAge: number | null;
  maxUses: number | null;
  temporary: boolean | null;
  uses: number | null;
}

export function invitePayload(invite: Invite, cached?: CachedInviteLike | null) {
  return {
    code: invite.code,
    url: invite.url,
    maxAge: invite.maxAge ?? cached?.maxAge ?? null,
    maxUses: invite.maxUses ?? cached?.maxUses ?? null,
    temporary: invite.temporary ?? cached?.temporary ?? null,
    uses: invite.uses ?? cached?.uses ?? null
  };
}

export function emojiPayload(emoji: GuildEmoji) {
  return {
    id: emoji.id,
    name: emoji.name,
    animated: emoji.animated,
    managed: emoji.managed,
    available: emoji.available,
    roles: [...emoji.roles.cache.keys()].sort()
  };
}

export function stickerPayload(sticker: Sticker) {
  return {
    id: sticker.id,
    guildId: sticker.guildId,
    name: sticker.name,
    description: sticker.description,
    type: sticker.type,
    format: sticker.format,
    available: sticker.available,
    tags: sticker.tags,
    user: sticker.user ? userPayload(sticker.user) : null
  };
}
