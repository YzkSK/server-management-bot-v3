import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eventNameSchema,
  realtimeDefaultDisabledEvents,
  realtimeDefaultEnabledEvents
} from "./events.js";

describe("realtime event lists", () => {
  it("has no overlap between enabled and disabled lists", () => {
    const enabledSet = new Set<string>(realtimeDefaultEnabledEvents);
    const overlap = realtimeDefaultDisabledEvents.filter((name) =>
      enabledSet.has(name)
    );
    assert.deepEqual(overlap, []);
  });

  it("includes voice.session.join/leave in the enabled list (audit §3.1: reversed from old spec)", () => {
    assert.ok(realtimeDefaultEnabledEvents.includes("voice.session.join"));
    assert.ok(realtimeDefaultEnabledEvents.includes("voice.session.leave"));
  });

  it("has no duplicate entries within either list", () => {
    assert.equal(
      new Set(realtimeDefaultEnabledEvents).size,
      realtimeDefaultEnabledEvents.length
    );
    assert.equal(
      new Set(realtimeDefaultDisabledEvents).size,
      realtimeDefaultDisabledEvents.length
    );
  });
});

describe("eventNameSchema", () => {
  it("accepts a non-empty string within 128 chars", () => {
    assert.equal(eventNameSchema.parse("member.join"), "member.join");
  });

  it("rejects an empty string", () => {
    assert.throws(() => eventNameSchema.parse(""));
  });

  it("rejects a string longer than 128 chars", () => {
    assert.throws(() => eventNameSchema.parse("a".repeat(129)));
  });
});
