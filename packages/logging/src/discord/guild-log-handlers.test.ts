import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createGuildLogHandlers } from "./guild-log-handlers.js";

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: "guild-1",
    name: "My Guild",
    description: null,
    ownerId: "owner-1",
    preferredLocale: "ja",
    verificationLevel: 1,
    premiumTier: 0,
    ...overrides
  } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createGuildLogHandlers", () => {
  it("writes guild.update when tracked fields changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createGuildLogHandlers({ writeLogEvent });

    await handlers.onGuildUpdate(fakeGuild({ name: "Old" }), fakeGuild({ name: "New" }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "guild.update");
  });

  it("skips guild.update when nothing tracked changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createGuildLogHandlers({ writeLogEvent });

    await handlers.onGuildUpdate(fakeGuild(), fakeGuild());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createGuildLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(
        handlers.onGuildUpdate(fakeGuild({ name: "Old" }), fakeGuild({ name: "New" }))
      );

      assert.equal(consoleError.mock.calls.length, 1);
      const [, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal((context as { eventName?: string }).eventName, "guild.update");
    } finally {
      consoleError.mock.restore();
    }
  });
});
