import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeStageCreate, normalizeStageDelete, normalizeStageUpdate } from "./stage-events.js";

function fakeStage(overrides: Record<string, unknown> = {}) {
  return {
    id: "stage-1",
    guildId: "guild-1",
    channelId: "channel-1",
    topic: "town hall",
    privacyLevel: 2,
    discoverableDisabled: false,
    ...overrides
  } as never;
}

describe("normalizeStageCreate", () => {
  it("normalizes a stage create with no known actor", () => {
    const event = normalizeStageCreate(fakeStage());

    assert.equal(event.eventName, "stage.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, null);
    assert.equal(event.channelId, "channel-1");
  });
});

describe("normalizeStageUpdate", () => {
  it("has no changes and null before when oldStage is null", () => {
    const event = normalizeStageUpdate(null, fakeStage());

    assert.equal(event.eventName, "stage.update");
    assert.equal(event.payload.before, null);
    assert.deepEqual(event.payload.changes, {});
  });

  it("diffs before/after when the topic changed", () => {
    const event = normalizeStageUpdate(
      fakeStage({ topic: "old-topic" }),
      fakeStage({ topic: "new-topic" })
    );

    assert.deepEqual(event.payload.changes, {
      topic: { before: "old-topic", after: "new-topic" }
    });
  });
});

describe("normalizeStageDelete", () => {
  it("normalizes a stage delete", () => {
    const event = normalizeStageDelete(fakeStage());

    assert.equal(event.eventName, "stage.delete");
    assert.equal(event.actorId, null);
  });
});
