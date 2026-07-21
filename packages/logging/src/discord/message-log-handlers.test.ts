import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, Collection, PermissionsBitField } from "discord.js";

import { createMessageLogHandlers } from "./message-log-handlers.js";

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    author: { id: "user-1", bot: false },
    guildId: "guild-1",
    channelId: "channel-1",
    id: "message-1",
    content: "hello",
    createdAt: new Date("2026-07-18T00:00:00.000Z"),
    editedAt: null,
    attachments: new Map(),
    ...overrides
  } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: "guild-1",
    members: { me: { permissions: new PermissionsBitField() } },
    ...overrides
  };
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
    changes: [],
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

function fakeBulkDeleteChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "channel-1",
    guildId: "guild-1",
    guild: fakeGuild(),
    ...overrides
  } as never;
}

describe("createMessageLogHandlers", () => {
  it("writes a normalized event for a human-authored message.create", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageCreate(fakeMessage());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "message.create");
    assert.equal(event?.messageId, "message-1");
  });

  it("skips bot-authored message.create", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageCreate(fakeMessage({ author: { id: "bot-1", bot: true } }));

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("skips message.update when content is unchanged", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageUpdate(
      fakeMessage({ content: "same" }),
      fakeMessage({ content: "same" })
    );

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("skips message.update when oldMessage is bot-authored even if newMessage.author is missing", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageUpdate(
      fakeMessage({ author: { id: "bot-1", bot: true }, content: "old" }),
      fakeMessage({ author: undefined, partial: true, content: null })
    );

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("writes a normalized event for message.update when content changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageUpdate(
      fakeMessage({ content: "old" }),
      fakeMessage({ content: "new" })
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "message.update");
  });

  it("writes a normalized event for message.delete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });

    await handlers.onMessageDelete(fakeMessage());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "message.delete");
  });

  it("writes message.bulk_delete with real message ids when no matching audit log entry is found", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });
    const messages = new Map([
      ["message-1", fakeMessage({ id: "message-1" })],
      ["message-2", fakeMessage({ id: "message-2" })]
    ]);

    await handlers.onMessageBulkDelete(
      messages as never,
      fakeBulkDeleteChannel({ guild: fakeGuild() })
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.eventName, "message.bulk_delete");
    assert.equal(event?.actorId, null);
    assert.deepEqual(event?.payload.messageIds, ["message-1", "message-2"]);
    assert.equal(event?.payload.count, 2);
    assert.equal(event?.payload.reason, null);
  });

  it("correlates message.bulk_delete with the matching MessageBulkDelete audit log entry", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([
        [
          "entry-1",
          auditLogEntry({
            action: AuditLogEvent.MessageBulkDelete,
            targetId: "channel-1",
            reason: "raid cleanup",
            extra: { count: 1 }
          })
        ]
      ])
    }));
    const messages = new Map([["message-1", fakeMessage({ id: "message-1" })]]);

    await handlers.onMessageBulkDelete(
      messages as never,
      fakeBulkDeleteChannel({ guild })
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, "actor-1");
    assert.equal(event?.payload.reason, "raid cleanup");
  });

  it("does not correlate with an audit log entry whose count does not match the deleted message count", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([
        [
          "entry-1",
          auditLogEntry({
            action: AuditLogEvent.MessageBulkDelete,
            targetId: "channel-1",
            reason: "unrelated cleanup",
            extra: { count: 5 }
          })
        ]
      ])
    }));
    const messages = new Map([["message-1", fakeMessage({ id: "message-1" })]]);

    await handlers.onMessageBulkDelete(
      messages as never,
      fakeBulkDeleteChannel({ guild })
    );

    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, null);
    assert.equal(event?.payload.reason, null);
  });

  it("does not correlate when two audit log entries have the same matching count (ambiguous)", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMessageLogHandlers({ writeLogEvent });
    const guild = grantedGuild(async () => ({
      entries: new Collection([
        [
          "entry-1",
          auditLogEntry({
            id: "entry-1",
            action: AuditLogEvent.MessageBulkDelete,
            targetId: "channel-1",
            executorId: "actor-1",
            reason: "moderator A",
            extra: { count: 2 }
          })
        ],
        [
          "entry-2",
          auditLogEntry({
            id: "entry-2",
            action: AuditLogEvent.MessageBulkDelete,
            targetId: "channel-1",
            executorId: "actor-2",
            reason: "moderator B",
            extra: { count: 2 }
          })
        ]
      ])
    }));
    const messages = new Map([
      ["message-1", fakeMessage({ id: "message-1" })],
      ["message-2", fakeMessage({ id: "message-2" })]
    ]);

    await handlers.onMessageBulkDelete(
      messages as never,
      fakeBulkDeleteChannel({ guild })
    );

    const event = writeLogEvent.mock.calls[0]?.arguments[0];
    assert.equal(event?.actorId, null);
    assert.equal(event?.payload.reason, null);
    assert.deepEqual(event?.payload.messageIds, ["message-1", "message-2"]);
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createMessageLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onMessageCreate(fakeMessage()));

      assert.equal(consoleError.mock.calls.length, 1);
      const [, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal((context as { eventName?: string }).eventName, "message.create");
      assert.equal((context as { guildId?: string }).guildId, "guild-1");
    } finally {
      consoleError.mock.restore();
    }
  });
});
