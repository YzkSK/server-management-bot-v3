import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeScheduledEventCreate,
  normalizeScheduledEventDelete,
  normalizeScheduledEventUpdate,
  normalizeScheduledEventUserAdd,
  normalizeScheduledEventUserRemove
} from "./scheduled-event-events.js";

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

describe("normalizeScheduledEventCreate", () => {
  it("uses the event creator as the actor", () => {
    const event = normalizeScheduledEventCreate(fakeEvent());

    assert.equal(event.eventName, "event.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, "creator-1");
    assert.equal(event.channelId, "channel-1");
  });
});

describe("normalizeScheduledEventUpdate", () => {
  it("has no changes and null before when oldEvent is null", () => {
    const event = normalizeScheduledEventUpdate(null, fakeEvent());

    assert.equal(event.eventName, "event.update");
    assert.equal(event.actorId, null);
    assert.equal(event.payload.before, null);
    assert.deepEqual(event.payload.changes, {});
  });

  it("diffs before/after when the name changed", () => {
    const event = normalizeScheduledEventUpdate(
      fakeEvent({ name: "old-name" }),
      fakeEvent({ name: "new-name" })
    );

    assert.deepEqual(event.payload.changes, {
      name: { before: "old-name", after: "new-name" }
    });
  });
});

describe("normalizeScheduledEventDelete", () => {
  it("normalizes with no actor", () => {
    const event = normalizeScheduledEventDelete(fakeEvent());

    assert.equal(event.eventName, "event.delete");
    assert.equal(event.actorId, null);
  });
});

describe("normalizeScheduledEventUserAdd", () => {
  it("uses the user as the actor", () => {
    const event = normalizeScheduledEventUserAdd(fakeEvent(), fakeUser());

    assert.equal(event.eventName, "event.user.add");
    assert.equal(event.actorId, "user-1");
    assert.equal(event.payload.eventId, "event-1");
  });
});

describe("normalizeScheduledEventUserRemove", () => {
  it("uses the user as the actor", () => {
    const event = normalizeScheduledEventUserRemove(fakeEvent(), fakeUser());

    assert.equal(event.eventName, "event.user.remove");
    assert.equal(event.actorId, "user-1");
  });
});
