import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent } from "discord.js";

import { createAuditLogEntryLogHandlers } from "./audit-log-entry-log-handlers.js";

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

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createAuditLogEntryLogHandlers", () => {
  it("writes a generic audit_log.entry for actions with no dedicated handler", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createAuditLogEntryLogHandlers({ writeLogEvent });

    await handlers.onAuditLogEntryCreate(fakeEntry({ action: AuditLogEvent.MemberMove }), fakeGuild());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "audit_log.entry");
  });

  it("skips actions already covered by a dedicated Group A/B handler", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createAuditLogEntryLogHandlers({ writeLogEvent });

    await handlers.onAuditLogEntryCreate(fakeEntry({ action: AuditLogEvent.RoleUpdate }), fakeGuild());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("writes a moderator-perspective message.delete for MessageDelete audit entries", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createAuditLogEntryLogHandlers({ writeLogEvent });

    await handlers.onAuditLogEntryCreate(
      fakeEntry({
        action: AuditLogEvent.MessageDelete,
        extra: { channel: { id: "channel-1" }, count: 1 }
      }),
      fakeGuild()
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "message.delete");
    assert.equal(event?.payload.partial, true);
  });

  it("writes message.bulk_delete for MessageBulkDelete audit entries", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createAuditLogEntryLogHandlers({ writeLogEvent });

    await handlers.onAuditLogEntryCreate(
      fakeEntry({ action: AuditLogEvent.MessageBulkDelete, targetId: "channel-1", extra: { count: 5 } }),
      fakeGuild()
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "message.bulk_delete");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createAuditLogEntryLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(
        handlers.onAuditLogEntryCreate(fakeEntry({ action: AuditLogEvent.MemberMove }), fakeGuild())
      );
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
