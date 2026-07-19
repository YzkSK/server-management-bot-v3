import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createPollLogHandlers } from "./poll-log-handlers.js";

function fakeAnswer(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    poll: {
      messageId: "message-1",
      channelId: "channel-1",
      message: { inGuild: () => true, guildId: "guild-1" }
    },
    ...overrides
  } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createPollLogHandlers", () => {
  it("writes message.poll.vote on onPollVoteAdd", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createPollLogHandlers({ writeLogEvent });

    await handlers.onPollVoteAdd(fakeAnswer(), "voter-1");

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "message.poll.vote");
  });

  it("writes message.poll.unvote on onPollVoteRemove", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createPollLogHandlers({ writeLogEvent });

    await handlers.onPollVoteRemove(fakeAnswer(), "voter-1");

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "message.poll.unvote");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createPollLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onPollVoteAdd(fakeAnswer(), "voter-1"));
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
