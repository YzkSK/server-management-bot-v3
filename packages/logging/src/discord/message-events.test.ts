import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeMessageCreate,
  normalizeMessageDelete,
  normalizeMessageUpdate,
  shouldSkipMessageLog
} from "./message-events.js";

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    author: { id: "user-1", bot: false },
    guildId: "guild-1",
    channelId: "channel-1",
    id: "message-1",
    content: "hello",
    createdAt: new Date("2026-07-18T00:00:00.000Z"),
    editedAt: null,
    attachments: new Map(),
    ...overrides
  } as never;
}

describe("shouldSkipMessageLog", () => {
  it("skips bot-authored messages", () => {
    assert.equal(
      shouldSkipMessageLog(fakeMessage({ author: { id: "bot-1", bot: true } })),
      true
    );
  });

  it("keeps human-authored messages", () => {
    assert.equal(shouldSkipMessageLog(fakeMessage()), false);
  });

  it("keeps partial messages without author data", () => {
    assert.equal(shouldSkipMessageLog(fakeMessage({ author: null })), false);
  });
});

describe("normalizeMessageCreate", () => {
  it("normalizes a human-authored message with full content", () => {
    const event = normalizeMessageCreate(fakeMessage());

    assert.equal(event.eventName, "message.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, "user-1");
    assert.equal(event.channelId, "channel-1");
    assert.equal(event.messageId, "message-1");
    assert.equal(event.payload.content, "hello");
  });

  it("only includes image/video attachments", () => {
    const attachments = new Map([
      ["a1", { url: "https://cdn/a1.png", name: "a1.png", contentType: "image/png" }],
      ["a2", { url: "https://cdn/a2.pdf", name: "a2.pdf", contentType: "application/pdf" }]
    ]);

    const event = normalizeMessageCreate(fakeMessage({ attachments }));

    assert.deepEqual(event.payload.attachments, [
      { url: "https://cdn/a1.png", name: "a1.png", contentType: "image/png" }
    ]);
  });
});

describe("normalizeMessageUpdate", () => {
  it("returns null when content is unchanged (embed unfurl)", () => {
    const event = normalizeMessageUpdate(
      fakeMessage({ content: "same" }),
      fakeMessage({ content: "same" })
    );

    assert.equal(event, null);
  });

  it("normalizes old/new content when content changed", () => {
    const event = normalizeMessageUpdate(
      fakeMessage({ content: "old" }),
      fakeMessage({ content: "new", editedAt: new Date("2026-07-18T00:05:00.000Z") })
    );

    assert.equal(event?.eventName, "message.update");
    assert.equal(event?.payload.oldContent, "old");
    assert.equal(event?.payload.newContent, "new");
    assert.equal(
      event?.eventTimestamp.getTime(),
      new Date("2026-07-18T00:05:00.000Z").getTime()
    );
  });

  it("treats a null old content (uncached partial) as changed", () => {
    const event = normalizeMessageUpdate(
      fakeMessage({ content: null }),
      fakeMessage({ content: "new" })
    );

    assert.ok(event);
    assert.equal(event?.payload.newContent, "new");
  });

  it("returns null when both old and new content are null and attachments are unchanged", () => {
    const attachments = new Map([
      ["a1", { url: "https://cdn/a1.png", name: "a1.png", contentType: "image/png" }]
    ]);

    const event = normalizeMessageUpdate(
      fakeMessage({ content: null, attachments }),
      fakeMessage({ content: null, attachments })
    );

    assert.equal(event, null);
  });

  it("normalizes an update when content is unchanged but attachments changed", () => {
    const oldAttachments = new Map([
      ["a1", { url: "https://cdn/a1.png", name: "a1.png", contentType: "image/png" }]
    ]);
    const newAttachments = new Map([
      ["a2", { url: "https://cdn/a2.png", name: "a2.png", contentType: "image/png" }]
    ]);

    const event = normalizeMessageUpdate(
      fakeMessage({ content: "same", attachments: oldAttachments }),
      fakeMessage({ content: "same", attachments: newAttachments })
    );

    assert.ok(event);
    assert.equal(event?.payload.newContent, "same");
    assert.deepEqual(event?.payload.attachments, [
      { url: "https://cdn/a2.png", name: "a2.png", contentType: "image/png" }
    ]);
  });

  it("falls back to now for eventTimestamp when editedAt is unavailable", () => {
    const before = Date.now();

    const event = normalizeMessageUpdate(
      fakeMessage({ content: "old" }),
      fakeMessage({ content: "new", editedAt: null })
    );

    const after = Date.now();

    assert.ok(event);
    const timestamp = event?.eventTimestamp.getTime() ?? 0;
    assert.ok(timestamp >= before && timestamp <= after);
  });
});

describe("normalizeMessageDelete", () => {
  it("normalizes a deleted message", () => {
    const event = normalizeMessageDelete(fakeMessage());

    assert.equal(event.eventName, "message.delete");
    assert.equal(event.messageId, "message-1");
    assert.equal(event.payload.content, "hello");
  });

  it("uses the current time for eventTimestamp, not the stale createdAt", () => {
    const before = Date.now();

    const event = normalizeMessageDelete(
      fakeMessage({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
    );

    const after = Date.now();

    assert.notEqual(
      event.eventTimestamp.getTime(),
      new Date("2020-01-01T00:00:00.000Z").getTime()
    );
    assert.ok(event.eventTimestamp.getTime() >= before && event.eventTimestamp.getTime() <= after);
  });
});
