import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AuditLogEvent, Collection, PermissionsBitField } from "discord.js";

import {
  applyAuditLog,
  getInviteGuild,
  lookupAuditLog,
  type AuditLogLookupResult
} from "./audit-log.js";

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return {
    members: {
      me: {
        permissions: new PermissionsBitField(PermissionsBitField.Flags.ViewAuditLog)
      }
    },
    fetchAuditLogs: async () => ({ entries: new Collection() }),
    ...overrides
  } as never;
}

function fakeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    action: AuditLogEvent.ChannelDelete,
    targetId: "target-1",
    target: null,
    executorId: "actor-1",
    executor: null,
    reason: null,
    createdTimestamp: Date.now(),
    get createdAt(): Date {
      return new Date(this.createdTimestamp as number);
    },
    ...overrides
  };
}

describe("lookupAuditLog", () => {
  it("returns missing_guild when guild is null", async () => {
    const result = await lookupAuditLog(null, AuditLogEvent.ChannelDelete, "target-1");

    assert.equal(result.status, "missing_guild");
    assert.equal(result.actorId, null);
  });

  it("returns missing_permission when bot lacks ViewAuditLog", async () => {
    const guild = fakeGuild({
      members: { me: { permissions: new PermissionsBitField() } }
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1");

    assert.equal(result.status, "missing_permission");
    assert.equal(result.actorId, null);
  });

  it("returns matched when a recent entry targets the same id", async () => {
    const guild = fakeGuild({
      fetchAuditLogs: async () => ({
        entries: new Collection([["entry-1", fakeEntry()]])
      })
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1");

    assert.equal(result.status, "matched");
    assert.equal(result.actorId, "actor-1");
  });

  it("returns matched when only entry.target.id matches (targetId fallback)", async () => {
    const guild = fakeGuild({
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", fakeEntry({ targetId: null, target: { id: "target-1" } })]
        ])
      })
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 0
    });

    assert.equal(result.status, "matched");
    assert.equal(result.actorId, "actor-1");
  });

  it("picks the entry closest to referenceTime when multiple entries match", async () => {
    const referenceTime = new Date();
    const guild = fakeGuild({
      fetchAuditLogs: async () => ({
        entries: new Collection([
          [
            "entry-far",
            fakeEntry({
              id: "entry-far",
              executorId: "actor-far",
              createdTimestamp: referenceTime.getTime() - 20_000
            })
          ],
          [
            "entry-near",
            fakeEntry({
              id: "entry-near",
              executorId: "actor-near",
              createdTimestamp: referenceTime.getTime() - 1_000
            })
          ]
        ])
      })
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 0,
      referenceTime
    });

    assert.equal(result.status, "matched");
    assert.equal(result.actorId, "actor-near");
  });

  it("matches against referenceTime instead of the current call time", async () => {
    const guild = fakeGuild({
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", fakeEntry({ createdTimestamp: Date.now() - 60_000 })]
        ])
      })
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 0,
      referenceTime: new Date(Date.now() - 60_000)
    });

    assert.equal(result.status, "matched");
  });

  it("returns not_found when no entry matches the target id", async () => {
    const guild = fakeGuild({
      fetchAuditLogs: async () => ({
        entries: new Collection([["entry-1", fakeEntry({ targetId: "other-target" })]])
      })
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 0
    });

    assert.equal(result.status, "not_found");
  });

  it("returns not_found when the matching entry is older than the lookup window", async () => {
    const guild = fakeGuild({
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", fakeEntry({ createdTimestamp: Date.now() - 60_000 })]
        ])
      })
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 0
    });

    assert.equal(result.status, "not_found");
  });

  it("returns not_found when the action type does not match", async () => {
    const guild = fakeGuild({
      fetchAuditLogs: async () => ({
        entries: new Collection([["entry-1", fakeEntry({ action: AuditLogEvent.ChannelCreate })]])
      })
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 0
    });

    assert.equal(result.status, "not_found");
  });

  it("retries when the audit log has not caught up yet, and returns matched once it has", async () => {
    let callCount = 0;
    const guild = fakeGuild({
      fetchAuditLogs: async () => {
        callCount += 1;
        return {
          entries:
            callCount < 2
              ? new Collection()
              : new Collection([["entry-1", fakeEntry()]])
        };
      }
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 2,
      retryDelayMs: 0
    });

    assert.equal(result.status, "matched");
    assert.equal(callCount, 2);
  });

  it("returns not_found after exhausting all retries", async () => {
    let callCount = 0;
    const guild = fakeGuild({
      fetchAuditLogs: async () => {
        callCount += 1;
        return { entries: new Collection() };
      }
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 2,
      retryDelayMs: 0
    });

    assert.equal(result.status, "not_found");
    assert.equal(callCount, 3);
  });

  it("returns error status when fetchAuditLogs throws", async () => {
    const guild = fakeGuild({
      fetchAuditLogs: async () => {
        throw new Error("boom");
      }
    });

    const result = await lookupAuditLog(guild, AuditLogEvent.ChannelDelete, "target-1", {
      retries: 0
    });

    assert.equal(result.status, "error");
    assert.equal((result.payload as { message: string }).message, "boom");
  });
});

describe("applyAuditLog", () => {
  it("overrides actorId and merges auditLog payload when matched", () => {
    const event = {
      eventName: "channel.delete",
      eventTimestamp: new Date(),
      receivedAt: new Date(),
      guildId: "guild-1",
      actorId: null,
      channelId: "channel-1",
      messageId: null,
      payload: { channel: { id: "channel-1" } }
    } as never;

    const auditLog: AuditLogLookupResult = {
      status: "matched",
      actorId: "actor-1",
      reason: "cleanup",
      payload: { status: "matched", executorId: "actor-1" }
    };

    const result = applyAuditLog(event, auditLog);

    assert.equal(result.actorId, "actor-1");
    assert.deepEqual(result.payload.auditLog, auditLog.payload);
    assert.deepEqual(result.payload.channel, { id: "channel-1" });
  });

  it("keeps the original actorId when no match was found", () => {
    const event = {
      eventName: "member.leave",
      eventTimestamp: new Date(),
      receivedAt: new Date(),
      guildId: "guild-1",
      actorId: "member-1",
      channelId: null,
      messageId: null,
      payload: {}
    } as never;

    const auditLog: AuditLogLookupResult = {
      status: "not_found",
      actorId: null,
      reason: null,
      payload: { status: "not_found" }
    };

    const result = applyAuditLog(event, auditLog);

    assert.equal(result.actorId, "member-1");
  });
});

describe("getInviteGuild", () => {
  it("returns the guild when it supports fetchAuditLogs", () => {
    const guild = { id: "guild-1", fetchAuditLogs: async () => ({ entries: new Map() }) };
    const invite = { guild } as never;

    assert.equal(getInviteGuild(invite), guild);
  });

  it("returns null when the invite guild is a partial InviteGuild", () => {
    const invite = { guild: { id: "guild-1", name: "Partial Guild" } } as never;

    assert.equal(getInviteGuild(invite), null);
  });

  it("returns null when the invite has no guild", () => {
    const invite = { guild: null } as never;

    assert.equal(getInviteGuild(invite), null);
  });
});
