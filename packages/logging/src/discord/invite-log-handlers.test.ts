import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, Collection, PermissionsBitField } from "discord.js";

import { createInviteCache } from "./invite-cache.js";
import { createInviteLogHandlers } from "./invite-log-handlers.js";

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: "guild-1",
    members: { me: { permissions: new PermissionsBitField() } },
    fetchAuditLogs: async () => ({ entries: new Collection() }),
    ...overrides
  };
}

function fakeInvite(overrides: Record<string, unknown> = {}) {
  return {
    code: "abc123",
    url: "https://discord.gg/abc123",
    maxAge: 86400,
    maxUses: 10,
    temporary: false,
    uses: 0,
    guild: fakeGuild(),
    channel: { id: "channel-1" },
    inviter: { id: "member-1", username: "member1", globalName: null, bot: false },
    ...overrides
  } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

function auditLogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    targetId: "abc123",
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

describe("createInviteLogHandlers", () => {
  it("caches the invite and writes invite.create on onInviteCreate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const inviteCache = createInviteCache();
    const handlers = createInviteLogHandlers({ writeLogEvent, inviteCache });

    await handlers.onInviteCreate(fakeInvite());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "invite.create");
    assert.deepEqual(inviteCache.getAndDelete("guild-1", "abc123"), {
      code: "abc123",
      url: "https://discord.gg/abc123",
      maxAge: 86400,
      maxUses: 10,
      temporary: false,
      uses: 0,
      inviterId: "member-1"
    });
  });

  it("reads and clears the cache entry on onInviteDelete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const inviteCache = createInviteCache();
    inviteCache.set("guild-1", fakeInvite());
    const handlers = createInviteLogHandlers({ writeLogEvent, inviteCache });

    await handlers.onInviteDelete(fakeInvite({ maxAge: null, uses: null, inviter: null }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "invite.delete");
    assert.equal((event?.payload.invite as { maxAge: number }).maxAge, 86400);
    assert.equal(inviteCache.getAndDelete("guild-1", "abc123"), null);
  });

  it("correlates invite.create with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const inviteCache = createInviteCache();
    const handlers = createInviteLogHandlers({ writeLogEvent, inviteCache });
    const guild = fakeGuild({
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ViewAuditLog) } },
      fetchAuditLogs: async () => ({
        entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.InviteCreate })]])
      })
    });

    await handlers.onInviteCreate(fakeInvite({ guild }));

    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].actorId, "actor-1");
  });

  it("calls inviteCache.initGuild for each guild on onClientReady", () => {
    const writeLogEvent = fakeWriteLogEvent();
    const inviteCache = {
      initGuild: mock.fn(async (_guild: { id: string }) => undefined),
      set: () => undefined,
      getAndDelete: () => null
    };
    const handlers = createInviteLogHandlers({ writeLogEvent, inviteCache });

    handlers.onClientReady([{ id: "guild-1" }, { id: "guild-2" }] as never);

    assert.equal(inviteCache.initGuild.mock.calls.length, 2);
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const inviteCache = createInviteCache();
    const handlers = createInviteLogHandlers({ writeLogEvent, inviteCache });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onInviteCreate(fakeInvite()));
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
