import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeEmojiCreate,
  normalizeEmojiDelete,
  normalizeEmojiUpdate,
  normalizeStickerCreate,
  normalizeStickerDelete,
  normalizeStickerUpdate
} from "./emoji-sticker-events.js";

function fakeEmoji(overrides: Record<string, unknown> = {}) {
  return {
    id: "emoji-1",
    guild: { id: "guild-1" },
    name: "pepe",
    animated: false,
    managed: false,
    available: true,
    roles: { cache: new Map() },
    ...overrides
  } as never;
}

function fakeSticker(overrides: Record<string, unknown> = {}) {
  return {
    id: "sticker-1",
    guildId: "guild-1",
    name: "wave",
    description: "a waving hand",
    type: 1,
    format: 1,
    available: true,
    tags: "wave",
    user: null,
    ...overrides
  } as never;
}

describe("normalizeEmojiCreate", () => {
  it("normalizes an emoji create with no known actor", () => {
    const event = normalizeEmojiCreate(fakeEmoji());

    assert.equal(event.eventName, "emoji.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, null);
  });
});

describe("normalizeEmojiUpdate", () => {
  it("returns null when nothing tracked changed", () => {
    assert.equal(normalizeEmojiUpdate(fakeEmoji(), fakeEmoji()), null);
  });

  it("normalizes an update when the name changed", () => {
    const event = normalizeEmojiUpdate(fakeEmoji({ name: "old" }), fakeEmoji({ name: "new" }));

    assert.ok(event);
    assert.equal(event?.eventName, "emoji.update");
  });
});

describe("normalizeEmojiDelete", () => {
  it("normalizes an emoji delete", () => {
    assert.equal(normalizeEmojiDelete(fakeEmoji()).eventName, "emoji.delete");
  });
});

describe("normalizeStickerCreate", () => {
  it("normalizes a sticker create with no known actor", () => {
    const event = normalizeStickerCreate(fakeSticker());

    assert.equal(event.eventName, "sticker.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, null);
  });
});

describe("normalizeStickerUpdate", () => {
  it("returns null when nothing tracked changed", () => {
    assert.equal(normalizeStickerUpdate(fakeSticker(), fakeSticker()), null);
  });

  it("normalizes an update when the name changed", () => {
    const event = normalizeStickerUpdate(fakeSticker({ name: "old" }), fakeSticker({ name: "new" }));

    assert.ok(event);
    assert.equal(event?.eventName, "sticker.update");
  });
});

describe("normalizeStickerDelete", () => {
  it("normalizes a sticker delete", () => {
    assert.equal(normalizeStickerDelete(fakeSticker()).eventName, "sticker.delete");
  });
});
