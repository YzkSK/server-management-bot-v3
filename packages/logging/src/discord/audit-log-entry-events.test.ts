import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AuditLogEvent } from "discord.js";

import {
  DEDICATED_AUDIT_LOG_ACTIONS,
  normalizeAuditLogEntry,
  normalizeAuditLogMessageBulkDelete,
  normalizeAuditLogMessageDelete
} from "./audit-log-entry-events.js";

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return { id: "guild-1", ...overrides } as never;
}

function fakeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    action: AuditLogEvent.MemberMove,
    targetId: "target-1",
    target: null,
    executorId: "actor-1",
    executor: null,
    reason: null,
    extra: null,
    changes: [],
    createdAt: new Date("2026-07-22T00:00:00.000Z"),
    ...overrides
  } as never;
}

describe("DEDICATED_AUDIT_LOG_ACTIONS", () => {
  const expectedDedicatedActions = [
    AuditLogEvent.GuildUpdate,
    AuditLogEvent.ChannelCreate,
    AuditLogEvent.ChannelUpdate,
    AuditLogEvent.ChannelDelete,
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.WebhookUpdate,
    AuditLogEvent.WebhookDelete,
    AuditLogEvent.MemberKick,
    AuditLogEvent.MemberBanAdd,
    AuditLogEvent.MemberBanRemove,
    AuditLogEvent.MemberUpdate,
    AuditLogEvent.MemberRoleUpdate,
    AuditLogEvent.RoleCreate,
    AuditLogEvent.RoleUpdate,
    AuditLogEvent.RoleDelete,
    AuditLogEvent.InviteCreate,
    AuditLogEvent.InviteDelete,
    AuditLogEvent.EmojiCreate,
    AuditLogEvent.EmojiUpdate,
    AuditLogEvent.EmojiDelete,
    AuditLogEvent.StickerCreate,
    AuditLogEvent.StickerUpdate,
    AuditLogEvent.StickerDelete,
    AuditLogEvent.ThreadCreate,
    AuditLogEvent.ThreadUpdate,
    AuditLogEvent.ThreadDelete,
    AuditLogEvent.AutoModerationRuleCreate,
    AuditLogEvent.AutoModerationRuleUpdate,
    AuditLogEvent.AutoModerationRuleDelete,
    AuditLogEvent.AutoModerationBlockMessage,
    AuditLogEvent.AutoModerationFlagToChannel,
    AuditLogEvent.AutoModerationUserCommunicationDisabled,
    AuditLogEvent.GuildScheduledEventCreate,
    AuditLogEvent.GuildScheduledEventUpdate,
    AuditLogEvent.GuildScheduledEventDelete,
    AuditLogEvent.StageInstanceCreate,
    AuditLogEvent.StageInstanceUpdate,
    AuditLogEvent.StageInstanceDelete,
    AuditLogEvent.IntegrationCreate,
    AuditLogEvent.IntegrationUpdate,
    AuditLogEvent.IntegrationDelete
  ];

  it("covers exactly the actions already recorded by dedicated Group A/B handlers", () => {
    for (const action of expectedDedicatedActions) {
      assert.equal(DEDICATED_AUDIT_LOG_ACTIONS.has(action), true, `expected ${action} to be covered`);
    }
    assert.equal(DEDICATED_AUDIT_LOG_ACTIONS.size, expectedDedicatedActions.length);
  });

  it("does not cover actions with no dedicated handler", () => {
    for (const action of [AuditLogEvent.MemberMove, AuditLogEvent.MemberDisconnect]) {
      assert.equal(DEDICATED_AUDIT_LOG_ACTIONS.has(action), false);
    }
  });

  it("does not cover the specially-handled message delete actions", () => {
    assert.equal(DEDICATED_AUDIT_LOG_ACTIONS.has(AuditLogEvent.MessageDelete), false);
    assert.equal(DEDICATED_AUDIT_LOG_ACTIONS.has(AuditLogEvent.MessageBulkDelete), false);
  });
});

describe("normalizeAuditLogEntry", () => {
  it("normalizes a generic audit log entry not covered by a dedicated handler", () => {
    const entry = fakeEntry({
      action: AuditLogEvent.MemberMove,
      targetId: "member-1",
      target: { username: "moved-user" },
      reason: "noisy"
    });

    const event = normalizeAuditLogEntry(entry, fakeGuild());

    assert.equal(event.eventName, "audit_log.entry");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, "actor-1");
    assert.equal(event.payload.action, AuditLogEvent.MemberMove);
    assert.equal(event.payload.targetId, "member-1");
    assert.equal(event.payload.targetName, "moved-user");
    assert.equal(event.payload.reason, "noisy");
  });

  it("falls back to null targetName when the target has no known name field", () => {
    const event = normalizeAuditLogEntry(fakeEntry({ target: null }), fakeGuild());

    assert.equal(event.payload.targetName, null);
  });

  it("prefers globalName, then username, then name for targetName", () => {
    const withGlobalName = normalizeAuditLogEntry(
      fakeEntry({ target: { globalName: "g", username: "u", name: "n" } }),
      fakeGuild()
    );
    assert.equal(withGlobalName.payload.targetName, "g");

    const withUsername = normalizeAuditLogEntry(
      fakeEntry({ target: { username: "u", name: "n" } }),
      fakeGuild()
    );
    assert.equal(withUsername.payload.targetName, "u");

    const withName = normalizeAuditLogEntry(fakeEntry({ target: { name: "n" } }), fakeGuild());
    assert.equal(withName.payload.targetName, "n");
  });
});

describe("normalizeAuditLogMessageDelete", () => {
  it("normalizes a moderator-perspective message.delete from an audit log entry", () => {
    const entry = fakeEntry({
      action: AuditLogEvent.MessageDelete,
      targetId: "author-1",
      extra: { channel: { id: "channel-1" }, count: 3 },
      reason: "spam"
    });

    const event = normalizeAuditLogMessageDelete(entry, fakeGuild());

    assert.equal(event.eventName, "message.delete");
    assert.equal(event.actorId, "actor-1");
    assert.equal(event.channelId, "channel-1");
    assert.equal(event.messageId, null);
    assert.deepEqual(event.payload, {
      source: "audit_log",
      auditLogEntryId: "entry-1",
      content: null,
      attachments: [],
      partial: true,
      targetUserId: "author-1",
      count: 3,
      reason: "spam"
    });
  });

  it("handles a missing extra payload gracefully", () => {
    const event = normalizeAuditLogMessageDelete(fakeEntry({ extra: null }), fakeGuild());

    assert.equal(event.channelId, null);
    assert.equal(event.payload.count, null);
  });
});

describe("normalizeAuditLogMessageBulkDelete", () => {
  it("normalizes a message.bulk_delete from an audit log entry", () => {
    const entry = fakeEntry({
      action: AuditLogEvent.MessageBulkDelete,
      targetId: "channel-1",
      extra: { count: 12 },
      reason: "raid cleanup"
    });

    const event = normalizeAuditLogMessageBulkDelete(entry, fakeGuild());

    assert.equal(event.eventName, "message.bulk_delete");
    assert.equal(event.actorId, "actor-1");
    assert.equal(event.channelId, "channel-1");
    assert.equal(event.messageId, null);
    assert.deepEqual(event.payload, {
      source: "audit_log",
      auditLogEntryId: "entry-1",
      messageIds: [],
      count: 12,
      reason: "raid cleanup"
    });
  });
});
