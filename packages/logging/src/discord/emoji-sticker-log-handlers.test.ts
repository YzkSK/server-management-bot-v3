import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, Collection, PermissionsBitField } from "discord.js";

import { createEmojiStickerLogHandlers } from "./emoji-sticker-log-handlers.js";

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: "guild-1",
    members: { me: { permissions: new PermissionsBitField() } },
    ...overrides
  };
}

function fakeEmoji(overrides: Record<string, unknown> = {}) {
  return {
    id: "emoji-1",
    guild: fakeGuild(),
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
    guild: fakeGuild(),
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

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

function auditLogEntry(targetId: string, action: AuditLogEvent) {
  return {
    id: "entry-1",
    targetId,
    target: null,
    executorId: "actor-1",
    executor: null,
    reason: null,
    action,
    createdTimestamp: Date.now(),
    get createdAt(): Date {
      return new Date(this.createdTimestamp as number);
    }
  };
}

describe("createEmojiStickerLogHandlers", () => {
  it("writes emoji.create/delete and sticker.create/delete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createEmojiStickerLogHandlers({ writeLogEvent });

    await handlers.onEmojiCreate(fakeEmoji());
    await handlers.onEmojiDelete(fakeEmoji());
    await handlers.onStickerCreate(fakeSticker());
    await handlers.onStickerDelete(fakeSticker());

    const eventNames = writeLogEvent.mock.calls.map((call) => call.arguments[0].eventName);
    assert.deepEqual(eventNames, [
      "emoji.create",
      "emoji.delete",
      "sticker.create",
      "sticker.delete"
    ]);
  });

  it("writes emoji.update/sticker.update only when tracked fields changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createEmojiStickerLogHandlers({ writeLogEvent });

    await handlers.onEmojiUpdate(fakeEmoji(), fakeEmoji());
    await handlers.onStickerUpdate(fakeSticker(), fakeSticker());
    assert.equal(writeLogEvent.mock.calls.length, 0);

    await handlers.onEmojiUpdate(fakeEmoji({ name: "old" }), fakeEmoji({ name: "new" }));
    await handlers.onStickerUpdate(fakeSticker({ name: "old" }), fakeSticker({ name: "new" }));
    assert.equal(writeLogEvent.mock.calls.length, 2);
  });

  it("correlates emoji.create with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createEmojiStickerLogHandlers({ writeLogEvent });
    const guild = fakeGuild({
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ViewAuditLog) } },
      fetchAuditLogs: async () => ({
        entries: new Collection([["entry-1", auditLogEntry("emoji-1", AuditLogEvent.EmojiCreate)]])
      })
    });

    await handlers.onEmojiCreate(fakeEmoji({ guild }));

    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].actorId, "actor-1");
  });

  it("correlates sticker.create with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createEmojiStickerLogHandlers({ writeLogEvent });
    const guild = fakeGuild({
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ViewAuditLog) } },
      fetchAuditLogs: async () => ({
        entries: new Collection([["entry-1", auditLogEntry("sticker-1", AuditLogEvent.StickerCreate)]])
      })
    });

    await handlers.onStickerCreate(fakeSticker({ guild }));

    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].actorId, "actor-1");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createEmojiStickerLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onEmojiCreate(fakeEmoji()));
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
