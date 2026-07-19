import type { NormalizedEvent } from "@sm-bot/shared";
import type { GuildEmoji, Sticker } from "discord.js";

import { diffRecord, emojiPayload, stickerPayload } from "./payloads.js";

export function normalizeEmojiCreate(emoji: GuildEmoji): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "emoji.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: emoji.guild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { emoji: emojiPayload(emoji) }
  };
}

export function normalizeEmojiUpdate(
  oldEmoji: GuildEmoji,
  newEmoji: GuildEmoji
): NormalizedEvent | null {
  const before = emojiPayload(oldEmoji);
  const after = emojiPayload(newEmoji);
  const changes = diffRecord(before, after);

  if (Object.keys(changes).length === 0) {
    return null;
  }

  const now = new Date();
  return {
    eventName: "emoji.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newEmoji.guild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { before, after, changes }
  };
}

export function normalizeEmojiDelete(emoji: GuildEmoji): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "emoji.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: emoji.guild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { emoji: emojiPayload(emoji) }
  };
}

export function normalizeStickerCreate(sticker: Sticker): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "sticker.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: sticker.guildId,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { sticker: stickerPayload(sticker) }
  };
}

export function normalizeStickerUpdate(
  oldSticker: Sticker,
  newSticker: Sticker
): NormalizedEvent | null {
  const before = stickerPayload(oldSticker);
  const after = stickerPayload(newSticker);
  const changes = diffRecord(before, after);

  if (Object.keys(changes).length === 0) {
    return null;
  }

  const now = new Date();
  return {
    eventName: "sticker.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newSticker.guildId,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { before, after, changes }
  };
}

export function normalizeStickerDelete(sticker: Sticker): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "sticker.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: sticker.guildId,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { sticker: stickerPayload(sticker) }
  };
}
