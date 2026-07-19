import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createScheduledEventLogHandlers } from "./scheduled-event-log-handlers.js";

function fakeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    guildId: "guild-1",
    name: "movie night",
    description: null,
    channelId: "channel-1",
    creatorId: "creator-1",
    entityType: 2,
    entityId: null,
    entityMetadata: null,
    privacyLevel: 2,
    status: 1,
    scheduledStartTimestamp: 1000,
    scheduledEndTimestamp: null,
    userCount: 3,
    ...overrides
  } as never;
}

function fakeUser(overrides: Record<string, unknown> = {}) {
  return { id: "user-1", username: "someone", globalName: null, bot: false, ...overrides } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createScheduledEventLogHandlers", () => {
  it("writes event.create on onScheduledEventCreate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createScheduledEventLogHandlers({ writeLogEvent });

    await handlers.onScheduledEventCreate(fakeEvent());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "event.create");
  });

  it("writes event.update on onScheduledEventUpdate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createScheduledEventLogHandlers({ writeLogEvent });

    await handlers.onScheduledEventUpdate(fakeEvent(), fakeEvent({ name: "changed" }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "event.update");
  });

  it("writes event.delete on onScheduledEventDelete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createScheduledEventLogHandlers({ writeLogEvent });

    await handlers.onScheduledEventDelete(fakeEvent());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "event.delete");
  });

  it("writes event.user.add on onScheduledEventUserAdd", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createScheduledEventLogHandlers({ writeLogEvent });

    await handlers.onScheduledEventUserAdd(fakeEvent(), fakeUser());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "event.user.add");
  });

  it("writes event.user.remove on onScheduledEventUserRemove", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createScheduledEventLogHandlers({ writeLogEvent });

    await handlers.onScheduledEventUserRemove(fakeEvent(), fakeUser());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "event.user.remove");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createScheduledEventLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onScheduledEventCreate(fakeEvent()));
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
