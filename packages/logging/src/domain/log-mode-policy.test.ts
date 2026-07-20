import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import {
  isLogModeControlledEvent,
  resolveLogWriteAction,
  stripMessageContent
} from "./log-mode-policy.js";

describe("isLogModeControlledEvent", () => {
  it("is true only for the message content event category", () => {
    assert.equal(isLogModeControlledEvent("message.create"), true);
    assert.equal(isLogModeControlledEvent("message.update"), true);
    assert.equal(isLogModeControlledEvent("message.delete"), true);
    assert.equal(isLogModeControlledEvent("member.join"), false);
  });
});

describe("resolveLogWriteAction", () => {
  it("always writes full for events outside the message content category", () => {
    assert.equal(resolveLogWriteAction("member.join", "full"), "write-full");
    assert.equal(resolveLogWriteAction("member.join", "metadata_only"), "write-full");
    assert.equal(resolveLogWriteAction("member.join", "disabled"), "write-full");
  });

  for (const eventName of ["message.create", "message.update", "message.delete"]) {
    it(`resolves ${eventName} per the guild logMode`, () => {
      assert.equal(resolveLogWriteAction(eventName, "full"), "write-full");
      assert.equal(
        resolveLogWriteAction(eventName, "metadata_only"),
        "write-metadata-only"
      );
      assert.equal(resolveLogWriteAction(eventName, "disabled"), "skip");
    });
  }
});

describe("stripMessageContent", () => {
  it("removes content from message.create but keeps other fields", () => {
    const event: NormalizedEvent = {
      eventTimestamp: new Date(),
      receivedAt: new Date(),
      eventName: "message.create",
      guildId: "guild-1",
      actorId: "user-1",
      channelId: "channel-1",
      messageId: "message-1",
      payload: { content: "secret", attachments: [{ url: "https://x" }] }
    };

    const stripped = stripMessageContent(event);

    assert.equal(stripped.payload.content, undefined);
    assert.deepEqual(stripped.payload.attachments, [{ url: "https://x" }]);
  });

  it("removes oldContent/newContent from message.update", () => {
    const event: NormalizedEvent = {
      eventTimestamp: new Date(),
      receivedAt: new Date(),
      eventName: "message.update",
      guildId: "guild-1",
      actorId: "user-1",
      channelId: "channel-1",
      messageId: "message-1",
      payload: { oldContent: "before", newContent: "after", partial: false }
    };

    const stripped = stripMessageContent(event);

    assert.equal(stripped.payload.oldContent, undefined);
    assert.equal(stripped.payload.newContent, undefined);
    assert.equal(stripped.payload.partial, false);
  });

  it("leaves non-message events untouched", () => {
    const event: NormalizedEvent = {
      eventTimestamp: new Date(),
      receivedAt: new Date(),
      eventName: "member.join",
      guildId: "guild-1",
      actorId: "user-1",
      channelId: null,
      messageId: null,
      payload: { displayName: "test" }
    };

    assert.deepEqual(stripMessageContent(event), event);
  });
});
