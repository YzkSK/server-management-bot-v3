import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRealtimeEnabled } from "./realtime-policy.js";

describe("resolveRealtimeEnabled", () => {
  it("returns true for an event in the default-enabled list", () => {
    assert.equal(resolveRealtimeEnabled("member.join"), true);
  });

  it("returns false for an event not in the default-enabled list", () => {
    assert.equal(resolveRealtimeEnabled("message.create"), false);
  });

  it("respects an explicit override of true even for a disabled-by-default event", () => {
    assert.equal(
      resolveRealtimeEnabled("message.create", { override: true }),
      true
    );
  });

  it("respects an explicit override of false even for an enabled-by-default event", () => {
    assert.equal(
      resolveRealtimeEnabled("member.join", { override: false }),
      false
    );
  });
});
