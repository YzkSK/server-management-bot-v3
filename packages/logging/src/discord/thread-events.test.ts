import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeThreadCreate,
  normalizeThreadDelete,
  normalizeThreadUpdate
} from "./thread-events.js";

function fakeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-1",
    guildId: "guild-1",
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

describe("normalizeThreadCreate", () => {
  it("normalizes a thread create with no known actor", () => {
    const event = normalizeThreadCreate(fakeThread(), true);

    assert.equal(event.eventName, "thread.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.channelId, "thread-1");
    assert.equal(event.actorId, null);
    assert.equal(event.payload.newlyCreated, true);
  });
});

describe("normalizeThreadDelete", () => {
  it("normalizes a thread delete", () => {
    const event = normalizeThreadDelete(fakeThread());

    assert.equal(event.eventName, "thread.delete");
    assert.equal(event.channelId, "thread-1");
  });
});

describe("normalizeThreadUpdate", () => {
  it("returns null when nothing tracked changed", () => {
    assert.equal(normalizeThreadUpdate(fakeThread(), fakeThread()), null);
  });

  it("normalizes an update when the name changed", () => {
    const event = normalizeThreadUpdate(
      fakeThread({ name: "old-name" }),
      fakeThread({ name: "new-name" })
    );

    assert.ok(event);
    assert.equal(event?.eventName, "thread.update");
    assert.deepEqual(event?.payload.changes, {
      name: { before: "old-name", after: "new-name" }
    });
  });
});
