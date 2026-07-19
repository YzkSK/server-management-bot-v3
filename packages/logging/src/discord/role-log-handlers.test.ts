import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, Collection, PermissionsBitField } from "discord.js";

import { createRoleLogHandlers } from "./role-log-handlers.js";

function fakeRole(overrides: Record<string, unknown> = {}) {
  return {
    id: "role-1",
    guild: { id: "guild-1", members: { me: { permissions: new PermissionsBitField() } } },
    name: "Admin",
    color: 0,
    hoist: false,
    position: 1,
    managed: false,
    mentionable: false,
    permissions: { bitfield: 0n },
    ...overrides
  } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

function grantedGuild(fetchAuditLogs: () => Promise<{ entries: Collection<string, unknown> }>) {
  return {
    id: "guild-1",
    members: { me: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ViewAuditLog) } },
    fetchAuditLogs
  };
}

function auditLogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    targetId: "role-1",
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

describe("createRoleLogHandlers", () => {
  it("writes role.create on onRoleCreate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createRoleLogHandlers({ writeLogEvent });

    await handlers.onRoleCreate(fakeRole());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "role.create");
  });

  it("writes role.delete on onRoleDelete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createRoleLogHandlers({ writeLogEvent });

    await handlers.onRoleDelete(fakeRole());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "role.delete");
  });

  it("writes role.update when tracked fields changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createRoleLogHandlers({ writeLogEvent });

    await handlers.onRoleUpdate(fakeRole({ name: "Old" }), fakeRole({ name: "New" }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "role.update");
  });

  it("correlates role.create with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createRoleLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.RoleCreate })]])
    }));

    await handlers.onRoleCreate(fakeRole({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, "actor-1");
  });

  it("correlates role.delete with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createRoleLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.RoleDelete })]])
    }));

    await handlers.onRoleDelete(fakeRole({ guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, "actor-1");
  });

  it("correlates role.update with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createRoleLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.RoleUpdate })]])
    }));

    await handlers.onRoleUpdate(fakeRole({ name: "Old", guild }), fakeRole({ name: "New", guild }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, "actor-1");
  });

  it("skips role.update when nothing tracked changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createRoleLogHandlers({ writeLogEvent });

    await handlers.onRoleUpdate(fakeRole(), fakeRole());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createRoleLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onRoleCreate(fakeRole()));

      assert.equal(consoleError.mock.calls.length, 1);
      const [, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal((context as { eventName?: string }).eventName, "role.create");
    } finally {
      consoleError.mock.restore();
    }
  });
});
