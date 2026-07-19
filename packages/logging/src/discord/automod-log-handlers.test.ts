import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createAutoModLogHandlers } from "./automod-log-handlers.js";

function fakeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    guild: { id: "guild-1" },
    name: "no-spam",
    creatorId: "creator-1",
    eventType: 1,
    triggerType: 1,
    triggerMetadata: {},
    actions: [],
    enabled: true,
    exemptRoles: new Map(),
    exemptChannels: new Map(),
    ...overrides
  } as never;
}

function fakeExecution(overrides: Record<string, unknown> = {}) {
  return {
    guild: { id: "guild-1" },
    ruleId: "rule-1",
    ruleTriggerType: 1,
    userId: "user-1",
    channelId: "channel-1",
    messageId: "message-1",
    alertSystemMessageId: null,
    content: "spam",
    matchedKeyword: "spam",
    matchedContent: "spam",
    action: { type: 1, metadata: {} },
    ...overrides
  } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createAutoModLogHandlers", () => {
  it("writes automod.rule.create on onRuleCreate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createAutoModLogHandlers({ writeLogEvent });

    await handlers.onRuleCreate(fakeRule());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "automod.rule.create");
  });

  it("writes automod.rule.update on onRuleUpdate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createAutoModLogHandlers({ writeLogEvent });

    await handlers.onRuleUpdate(fakeRule(), fakeRule({ name: "changed" }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "automod.rule.update");
  });

  it("writes automod.rule.delete on onRuleDelete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createAutoModLogHandlers({ writeLogEvent });

    await handlers.onRuleDelete(fakeRule());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "automod.rule.delete");
  });

  it("writes automod.action on onActionExecution", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createAutoModLogHandlers({ writeLogEvent });

    await handlers.onActionExecution(fakeExecution());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "automod.action");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createAutoModLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onRuleCreate(fakeRule()));
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
