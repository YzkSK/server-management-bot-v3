import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { writeSafely } from "./write-safely.js";

function fakeEvent(): NormalizedEvent {
  return {
    eventName: "guild.update",
    guildId: "guild-1",
    eventTimestamp: new Date().toISOString(),
    actorId: null,
    targetId: null,
    payload: {}
  } as never;
}

describe("writeSafely", () => {
  it("delegates to writeLogEvent and does not log on success", async () => {
    const writeLogEvent = mock.fn(async () => undefined);
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await writeSafely({ writeLogEvent }, fakeEvent(), "guild-log-handlers");

      assert.equal(writeLogEvent.mock.calls.length, 1);
      assert.equal(consoleError.mock.calls.length, 0);
    } finally {
      consoleError.mock.restore();
    }
  });

  it("swallows errors from writeLogEvent and logs with the given source prefix", async () => {
    const thrown = new Error("db down");
    const writeLogEvent = mock.fn(async () => {
      throw thrown;
    });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(writeSafely({ writeLogEvent }, fakeEvent(), "guild-log-handlers"));

      assert.equal(consoleError.mock.calls.length, 1);
      const [message, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal(message, "guild-log-handlers: failed to write log event");
      assert.equal((context as { eventName?: string }).eventName, "guild.update");
      assert.equal((context as { guildId?: string }).guildId, "guild-1");
      assert.equal((context as { err?: unknown }).err, thrown);
    } finally {
      consoleError.mock.restore();
    }
  });
});
