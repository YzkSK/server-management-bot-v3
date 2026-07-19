import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeAutoModAction,
  normalizeAutoModRuleCreate,
  normalizeAutoModRuleDelete,
  normalizeAutoModRuleUpdate
} from "./automod-events.js";

function fakeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    guild: { id: "guild-1" },
    name: "no-spam",
    creatorId: "creator-1",
    eventType: 1,
    triggerType: 1,
    triggerMetadata: { keywordFilter: ["spam"] },
    actions: [{ type: 1, metadata: {} }],
    enabled: true,
    exemptRoles: new Map([["role-1", {}]]),
    exemptChannels: new Map([["channel-1", {}]]),
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
    content: "spam spam spam",
    matchedKeyword: "spam",
    matchedContent: "spam",
    action: { type: 1, metadata: {} },
    ...overrides
  } as never;
}

describe("normalizeAutoModRuleCreate", () => {
  it("uses the rule creator as the actor", () => {
    const event = normalizeAutoModRuleCreate(fakeRule());

    assert.equal(event.eventName, "automod.rule.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, "creator-1");
    assert.equal(event.payload.rule && (event.payload.rule as { id: string }).id, "rule-1");
  });
});

describe("normalizeAutoModRuleUpdate", () => {
  it("has no changes and null before when oldRule is null", () => {
    const event = normalizeAutoModRuleUpdate(null, fakeRule());

    assert.equal(event.eventName, "automod.rule.update");
    assert.equal(event.actorId, null);
    assert.equal(event.payload.before, null);
    assert.deepEqual(event.payload.changes, {});
  });

  it("diffs before/after when the rule name changed", () => {
    const event = normalizeAutoModRuleUpdate(
      fakeRule({ name: "old-name" }),
      fakeRule({ name: "new-name" })
    );

    assert.deepEqual(event.payload.changes, {
      name: { before: "old-name", after: "new-name" }
    });
  });
});

describe("normalizeAutoModRuleDelete", () => {
  it("uses the rule creator as the actor", () => {
    const event = normalizeAutoModRuleDelete(fakeRule());

    assert.equal(event.eventName, "automod.rule.delete");
    assert.equal(event.actorId, "creator-1");
  });
});

describe("normalizeAutoModAction", () => {
  it("uses the execution userId as the actor", () => {
    const event = normalizeAutoModAction(fakeExecution());

    assert.equal(event.eventName, "automod.action");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, "user-1");
    assert.equal(event.channelId, "channel-1");
    assert.equal(event.messageId, "message-1");
    assert.equal(
      (event.payload.action as { ruleId: string }).ruleId,
      "rule-1"
    );
  });
});
