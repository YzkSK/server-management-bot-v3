import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, Collection, PermissionsBitField } from "discord.js";

import { createMemberLogHandlers } from "./member-log-handlers.js";

function fakeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    guild: { id: "guild-1", members: { me: { permissions: new PermissionsBitField() } } },
    displayName: "Display",
    nickname: null,
    user: { id: "member-1", username: "member1", globalName: null, bot: false },
    roles: { cache: new Map([["role-1", {}]]) },
    pending: false,
    communicationDisabledUntil: null,
    ...overrides
  } as never;
}

function fakeBan(overrides: Record<string, unknown> = {}) {
  return {
    guild: { id: "guild-1", members: { me: { permissions: new PermissionsBitField() } } },
    user: { id: "member-1", username: "member1", globalName: null, bot: false },
    reason: null,
    ...overrides
  } as never;
}

function auditLogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    targetId: "member-1",
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

function grantedGuildMembers() {
  return { me: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ViewAuditLog) } };
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createMemberLogHandlers", () => {
  it("writes member.join on onGuildMemberAdd", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });

    await handlers.onGuildMemberAdd(fakeMember());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "member.join");
  });

  it("writes member.leave on onGuildMemberRemove", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });

    await handlers.onGuildMemberRemove(fakeMember());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "member.leave");
  });

  it("rewrites member.leave to member.kick when a MemberKick audit log entry matches", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", auditLogEntry({ action: AuditLogEvent.MemberKick })]
        ])
      })
    };

    await handlers.onGuildMemberRemove(fakeMember({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "member.kick");
    assert.equal(event?.actorId, "actor-1");
  });

  it("keeps member.leave when no MemberKick audit log entry matches", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async () => ({ entries: new Collection() })
    };

    await handlers.onGuildMemberRemove(fakeMember({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "member.leave");
    assert.equal(event?.actorId, "member-1");
  });

  it("does not write member.leave when GuildBanAdd fired just before GuildMemberRemove", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", auditLogEntry({ action: AuditLogEvent.MemberBanAdd })]
        ])
      })
    };

    await handlers.onGuildBanAdd(fakeBan({ guild }));
    await handlers.onGuildMemberRemove(fakeMember({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "member.ban");
  });

  it("does not write member.leave when GuildMemberRemove arrives before GuildBanAdd", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", auditLogEntry({ action: AuditLogEvent.MemberBanAdd })]
        ])
      })
    };

    const removePromise = handlers.onGuildMemberRemove(fakeMember({ guild }));
    await handlers.onGuildBanAdd(fakeBan({ guild }));
    await removePromise;

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "member.ban");
  });

  it("writes member.leave normally when no ban was marked for that member", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", auditLogEntry({ action: AuditLogEvent.MemberBanAdd, targetId: "other-member" })]
        ])
      })
    };

    await handlers.onGuildBanAdd(fakeBan({ guild, user: { id: "other-member" } }));
    await handlers.onGuildMemberRemove(fakeMember({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 2);
    assert.equal(writeLogEvent.mock.calls[1]?.arguments[0].eventName, "member.leave");
  });

  it("writes member.ban with actor from a matching MemberBanAdd audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", auditLogEntry({ action: AuditLogEvent.MemberBanAdd })]
        ])
      })
    };

    await handlers.onGuildBanAdd(fakeBan({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "member.ban");
    assert.equal(event?.actorId, "actor-1");
  });

  it("writes member.unban with actor from a matching MemberBanRemove audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", auditLogEntry({ action: AuditLogEvent.MemberBanRemove })]
        ])
      })
    };

    await handlers.onGuildBanRemove(fakeBan({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "member.unban");
    assert.equal(event?.actorId, "actor-1");
  });

  it("writes member.update when tracked fields changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });

    await handlers.onGuildMemberUpdate(
      fakeMember({ nickname: null }),
      fakeMember({ nickname: "New" })
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "member.update");
  });

  it("correlates member.update with a matching MemberUpdate audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async () => ({
        entries: new Collection([
          ["entry-1", auditLogEntry({ action: AuditLogEvent.MemberUpdate })]
        ])
      })
    };

    await handlers.onGuildMemberUpdate(
      fakeMember({ nickname: null }),
      fakeMember({ guild, nickname: "New" })
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, "actor-1");
  });

  it("correlates a roles change with a MemberRoleUpdate audit log entry instead of MemberUpdate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const guild = {
      id: "guild-1",
      members: grantedGuildMembers(),
      fetchAuditLogs: async ({ type }: { type: AuditLogEvent }) => ({
        entries:
          type === AuditLogEvent.MemberRoleUpdate
            ? new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.MemberRoleUpdate })]])
            : new Collection()
      })
    };

    await handlers.onGuildMemberUpdate(
      fakeMember({ roles: { cache: new Map([["role-1", {}]]) } }),
      fakeMember({ guild, roles: { cache: new Map([["role-1", {}], ["role-2", {}]]) } })
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, "actor-1");
  });

  it("skips member.update when nothing tracked changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });

    await handlers.onGuildMemberUpdate(fakeMember(), fakeMember());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onGuildMemberAdd(fakeMember()));

      assert.equal(consoleError.mock.calls.length, 1);
      const [, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal((context as { eventName?: string }).eventName, "member.join");
      assert.equal((context as { guildId?: string }).guildId, "guild-1");
    } finally {
      consoleError.mock.restore();
    }
  });
});
