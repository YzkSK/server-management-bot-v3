import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, Collection, PermissionsBitField } from "discord.js";

import { createThreadLogHandlers } from "./thread-log-handlers.js";

function fakeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-1",
    guildId: "guild-1",
    guild: { id: "guild-1", members: { me: { permissions: new PermissionsBitField() } } },
    name: "help-desk",
    type: 11,
    parentId: "channel-1",
    ownerId: "member-1",
    archived: false,
    locked: false,
    invitable: true,
    autoArchiveDuration: 1440,
    rateLimitPerUser: 0,
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
    targetId: "thread-1",
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

describe("createThreadLogHandlers", () => {
  it("writes thread.create on onThreadCreate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createThreadLogHandlers({ writeLogEvent });

    await handlers.onThreadCreate(fakeThread(), true);

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "thread.create");
  });

  it("writes thread.delete on onThreadDelete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createThreadLogHandlers({ writeLogEvent });

    await handlers.onThreadDelete(fakeThread());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "thread.delete");
  });

  it("skips thread.update when nothing tracked changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createThreadLogHandlers({ writeLogEvent });

    await handlers.onThreadUpdate(fakeThread(), fakeThread());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("correlates thread.create with a matching audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createThreadLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([["entry-1", auditLogEntry({ action: AuditLogEvent.ThreadCreate })]])
    }));

    await handlers.onThreadCreate(fakeThread({ guild }), true);

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].actorId, "actor-1");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createThreadLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onThreadCreate(fakeThread(), true));
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
