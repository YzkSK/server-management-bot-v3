import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, Collection, PermissionsBitField } from "discord.js";

import { createChannelLogHandlers } from "./channel-log-handlers.js";

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: "guild-1",
    members: { me: { permissions: new PermissionsBitField() } },
    ...overrides
  };
}

function fakeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "channel-1",
    guildId: "guild-1",
    guild: fakeGuild(),
    name: "general",
    type: 0,
    parentId: null,
    position: 0,
    rateLimitPerUser: 0,
    permissionOverwrites: { cache: new Map() },
    ...overrides
  } as never;
}

function fakeDmChannel() {
  return { id: "dm-1" } as never;
}

function grantedGuild(fetchAuditLogs: () => Promise<{ entries: Collection<string, unknown> }>) {
  return fakeGuild({
    members: { me: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ViewAuditLog) } },
    fetchAuditLogs
  });
}

function auditLogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    targetId: "channel-1",
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

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createChannelLogHandlers", () => {
  it("writes channel.create on onChannelCreate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelCreate(fakeChannel());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "channel.create");
  });

  it("writes channel.delete on onChannelDelete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelDelete(fakeChannel());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "channel.delete");
  });

  it("skips onChannelDelete for a DM channel", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelDelete(fakeDmChannel());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("writes both channel.update and channel.permission_update when both changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelUpdate(
      fakeChannel({ name: "old", permissionOverwrites: { cache: new Map() } }),
      fakeChannel({
        name: "new",
        permissionOverwrites: {
          cache: new Map([
            ["role-1", { id: "role-1", type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } }]
          ])
        }
      })
    );

    assert.equal(writeLogEvent.mock.calls.length, 2);
    const events = writeLogEvent.mock.calls.map((call) => call.arguments[0]);
    const permissionUpdate = events.find((event) => event.eventName === "channel.permission_update");
    assert.equal(permissionUpdate?.actorId, null);
    assert.equal((permissionUpdate?.payload as { auditLog?: unknown }).auditLog, undefined);
  });

  it("correlates channel.create with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.ChannelCreate })]])
    }));

    await handlers.onChannelCreate(fakeChannel({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, "actor-1");
    assert.equal((event?.payload as { auditLog?: { status?: string } }).auditLog?.status, "matched");
  });

  it("correlates channel.delete with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.ChannelDelete })]])
    }));

    await handlers.onChannelDelete(fakeChannel({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, "actor-1");
  });

  it("correlates channel.update (but not channel.permission_update) with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.ChannelUpdate })]])
    }));

    await handlers.onChannelUpdate(
      fakeChannel({ name: "old", guild }),
      fakeChannel({
        name: "new",
        guild,
        permissionOverwrites: {
          cache: new Map([
            ["role-1", { id: "role-1", type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } }]
          ])
        }
      })
    );

    assert.equal(writeLogEvent.mock.calls.length, 2);
    const events = writeLogEvent.mock.calls.map((call) => call.arguments[0]);
    const update = events.find((event) => event.eventName === "channel.update");
    const permissionUpdate = events.find((event) => event.eventName === "channel.permission_update");
    assert.equal(update?.actorId, "actor-1");
    assert.equal(permissionUpdate?.actorId, null);
  });

  it("skips onChannelUpdate for DM channels", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelUpdate(fakeDmChannel(), fakeDmChannel());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createChannelLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onChannelCreate(fakeChannel()));

      assert.equal(consoleError.mock.calls.length, 1);
      const [, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal((context as { eventName?: string }).eventName, "channel.create");
    } finally {
      consoleError.mock.restore();
    }
  });

  it("writes webhook.update on onWebhooksUpdate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onWebhooksUpdate(fakeChannel());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "webhook.update");
  });

  it("correlates webhook.update with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.WebhookUpdate })]])
    }));

    await handlers.onWebhooksUpdate(fakeChannel({ guild }));

    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].actorId, "actor-1");
  });
});
