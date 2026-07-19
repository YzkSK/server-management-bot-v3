import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizePollUnvote, normalizePollVote } from "./poll-events.js";

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

describe("normalizePollVote", () => {
  it("normalizes with the guildId resolved from the cached message", () => {
    const event = normalizePollVote(fakeAnswer(), "voter-1");

    assert.equal(event.eventName, "message.poll.vote");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, "voter-1");
    assert.equal(event.channelId, "channel-1");
    assert.equal(event.messageId, "message-1");
    assert.deepEqual(event.payload, {
      messageId: "message-1",
      channelId: "channel-1",
      answerId: 1,
      userId: "voter-1"
    });
  });

  it("falls back to a null guildId when the message is not in a guild", () => {
    const event = normalizePollVote(
      fakeAnswer({
        poll: {
          messageId: "message-1",
          channelId: "channel-1",
          message: { inGuild: () => false }
        }
      }),
      "voter-1"
    );

    assert.equal(event.guildId, null);
  });
});

describe("normalizePollUnvote", () => {
  it("normalizes as message.poll.unvote", () => {
    const event = normalizePollUnvote(fakeAnswer(), "voter-1");

    assert.equal(event.eventName, "message.poll.unvote");
    assert.equal(event.actorId, "voter-1");
  });
});
