import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createMessageLogHandlers } from "./message-log-handlers.js";

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

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createMessageLogHandlers", () => {
  it("writes a normalized event for a human-authored message.create", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageCreate(fakeMessage());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "message.create");
    assert.equal(event?.messageId, "message-1");
  });

  it("skips bot-authored message.create", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageCreate(fakeMessage({ author: { id: "bot-1", bot: true } }));

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("skips message.update when content is unchanged", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageUpdate(
      fakeMessage({ content: "same" }),
      fakeMessage({ content: "same" })
    );

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("writes a normalized event for message.update when content changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageUpdate(
      fakeMessage({ content: "old" }),
      fakeMessage({ content: "new" })
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "message.update");
  });

  it("writes a normalized event for message.delete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageDelete(fakeMessage());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "message.delete");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createMessageLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onMessageCreate(fakeMessage()));

      assert.equal(consoleError.mock.calls.length, 1);
      const [, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal((context as { eventName?: string }).eventName, "message.create");
      assert.equal((context as { guildId?: string }).guildId, "guild-1");
    } finally {
      consoleError.mock.restore();
    }
  });
});
