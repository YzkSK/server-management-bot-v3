import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ALL_CAPABILITIES, CAP } from "@sm-bot/shared";

import { resolveEffectiveCapabilities } from "./effective-capabilities.js";

describe("resolveEffectiveCapabilities", () => {
  it("ORs together the capabilities of every matching grant", () => {
    const result = resolveEffectiveCapabilities({
      grants: [{ capabilities: CAP.VIEW_LOGS }, { capabilities: CAP.MANAGE_VOICE }],
      isGuildOwner: false
    });

    assert.equal(result, CAP.VIEW_LOGS | CAP.MANAGE_VOICE);
  });

  it("grants exactly every known capability bit when the principal is the guild owner, even with no grants", () => {
    const result = resolveEffectiveCapabilities({ grants: [], isGuildOwner: true });

    assert.equal(result, ALL_CAPABILITIES);
  });

  it("grants exactly every known capability bit for the guild owner regardless of their grants", () => {
    const result = resolveEffectiveCapabilities({
      grants: [{ capabilities: CAP.VIEW_LOGS }],
      isGuildOwner: true
    });

    assert.equal(result, ALL_CAPABILITIES);
  });

  it("returns 0n for a non-owner with no grants", () => {
    const result = resolveEffectiveCapabilities({ grants: [], isGuildOwner: false });
    assert.equal(result, 0n);
  });

  it("rejects a grant with a negative capabilities value", () => {
    assert.throws(
      () =>
        resolveEffectiveCapabilities({
          grants: [{ capabilities: -1n }],
          isGuildOwner: false
        }),
      /negative/
    );
  });

  it("rejects a grant with an unknown upper bit", () => {
    assert.throws(
      () =>
        resolveEffectiveCapabilities({
          grants: [{ capabilities: CAP.VIEW_LOGS }, { capabilities: 1n << 99n }],
          isGuildOwner: false
        }),
      /unknown capabilities bits/
    );
  });

  it("rejects an invalid grant even when the principal is the guild owner", () => {
    assert.throws(
      () =>
        resolveEffectiveCapabilities({
          grants: [{ capabilities: -1n }],
          isGuildOwner: true
        }),
      RangeError
    );
  });
});
