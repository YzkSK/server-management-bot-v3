import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type GuildEmoji, type Sticker } from "discord.js";

import { correlateWithAuditLog } from "./audit-log.js";
import {
  normalizeEmojiCreate,
  normalizeEmojiDelete,
  normalizeEmojiUpdate,
  normalizeStickerCreate,
  normalizeStickerDelete,
  normalizeStickerUpdate
} from "./emoji-sticker-events.js";
import { writeSafely } from "./write-safely.js";

export interface EmojiStickerLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface EmojiStickerLogHandlers {
  onEmojiCreate: (emoji: GuildEmoji) => Promise<void>;
  onEmojiDelete: (emoji: GuildEmoji) => Promise<void>;
  onEmojiUpdate: (oldEmoji: GuildEmoji, newEmoji: GuildEmoji) => Promise<void>;
  onStickerCreate: (sticker: Sticker) => Promise<void>;
  onStickerDelete: (sticker: Sticker) => Promise<void>;
  onStickerUpdate: (oldSticker: Sticker, newSticker: Sticker) => Promise<void>;
}

export function createEmojiStickerLogHandlers(
  deps: EmojiStickerLogHandlerDeps
): EmojiStickerLogHandlers {
  return {
    async onEmojiCreate(emoji) {
      const event = normalizeEmojiCreate(emoji);
      const correlated = await correlateWithAuditLog(
        event,
        emoji.guild,
        AuditLogEvent.EmojiCreate,
        emoji.id
      );
      await writeSafely(deps, correlated, "emoji-sticker-log-handlers");
    },

    async onEmojiDelete(emoji) {
      const event = normalizeEmojiDelete(emoji);
      const correlated = await correlateWithAuditLog(
        event,
        emoji.guild,
        AuditLogEvent.EmojiDelete,
        emoji.id
      );
      await writeSafely(deps, correlated, "emoji-sticker-log-handlers");
    },

    async onEmojiUpdate(oldEmoji, newEmoji) {
      const event = normalizeEmojiUpdate(oldEmoji, newEmoji);
      if (!event) {
        return;
      }
      const correlated = await correlateWithAuditLog(
        event,
        newEmoji.guild,
        AuditLogEvent.EmojiUpdate,
        newEmoji.id
      );
      await writeSafely(deps, correlated, "emoji-sticker-log-handlers");
    },

    async onStickerCreate(sticker) {
      const event = normalizeStickerCreate(sticker);
      const correlated = await correlateWithAuditLog(
        event,
        sticker.guild,
        AuditLogEvent.StickerCreate,
        sticker.id
      );
      await writeSafely(deps, correlated, "emoji-sticker-log-handlers");
    },

    async onStickerDelete(sticker) {
      const event = normalizeStickerDelete(sticker);
      const correlated = await correlateWithAuditLog(
        event,
        sticker.guild,
        AuditLogEvent.StickerDelete,
        sticker.id
      );
      await writeSafely(deps, correlated, "emoji-sticker-log-handlers");
    },

    async onStickerUpdate(oldSticker, newSticker) {
      const event = normalizeStickerUpdate(oldSticker, newSticker);
      if (!event) {
        return;
      }
      const correlated = await correlateWithAuditLog(
        event,
        newSticker.guild,
        AuditLogEvent.StickerUpdate,
        newSticker.id
      );
      await writeSafely(deps, correlated, "emoji-sticker-log-handlers");
    }
  };
}
