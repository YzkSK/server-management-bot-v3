import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ALL_CAPABILITIES, CAP, hasCapability } from "@sm-bot/shared";

import { resolveEffectiveCapabilities } from "./effective-capabilities.js";

describe("resolveEffectiveCapabilities", () => {
  it("ORs together the capabilities of every matching grant", () => {
    const result = resolveEffectiveCapabilities({
      grants: [{ capabilities: CAP.VIEW_LOGS }, { capabilities: CAP.MANAGE_VOICE }],
      isGuildOwner: false
    });

    assert.equal(hasCapability(result, CAP.VIEW_LOGS), true);
    assert.equal(hasCapability(result, CAP.MANAGE_VOICE), true);
    assert.equal(hasCapability(result, CAP.MANAGE_ACCESS), false);
  });

  it("grants exactly every known capability bit when the principal is the guild owner, even with no grants", () => {
    const result = resolveEffectiveCapabilities({ grants: [], isGuildOwner: true });

    assert.equal(result, ALL_CAPABILITIES);
  });

  it("returns 0n for a non-owner with no grants", () => {
    const result = resolveEffectiveCapabilities({ grants: [], isGuildOwner: false });
    assert.equal(result, 0n);
  });
});
