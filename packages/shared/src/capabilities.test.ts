import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BASELINE_EVERYONE_CAPABILITIES,
  CAP,
  canGrantCapabilities,
  capabilitiesToWireString,
  combineCapabilities,
  hasCapability,
  parseCapabilitiesWireString
} from "./capabilities.js";

describe("hasCapability", () => {
  it("returns true when the bit is set", () => {
    assert.equal(hasCapability(CAP.VIEW_LOGS | CAP.MANAGE_VOICE, CAP.VIEW_LOGS), true);
  });

  it("returns false when the bit is not set", () => {
    assert.equal(hasCapability(CAP.VIEW_LOGS, CAP.MANAGE_VOICE), false);
  });
});

describe("combineCapabilities", () => {
  it("ORs every value together", () => {
    const combined = combineCapabilities(CAP.VIEW_LOGS, CAP.VIEW_VOICE, 0n);
    assert.equal(hasCapability(combined, CAP.VIEW_LOGS), true);
    assert.equal(hasCapability(combined, CAP.VIEW_VOICE), true);
    assert.equal(hasCapability(combined, CAP.MANAGE_VOICE), false);
  });

  it("returns 0n for no inputs", () => {
    assert.equal(combineCapabilities(), 0n);
  });
});

describe("BASELINE_EVERYONE_CAPABILITIES", () => {
  it("includes exactly the four view_* capabilities", () => {
    for (const cap of [CAP.VIEW_LOGS, CAP.VIEW_VOICE, CAP.VIEW_RECRUITMENT, CAP.VIEW_TTS]) {
      assert.equal(hasCapability(BASELINE_EVERYONE_CAPABILITIES, cap), true);
    }
    for (const cap of [CAP.MANAGE_VOICE, CAP.MANAGE_ACCESS, CAP.VIEW_LOGS_RAW]) {
      assert.equal(hasCapability(BASELINE_EVERYONE_CAPABILITIES, cap), false);
    }
  });
});

describe("canGrantCapabilities", () => {
  it("allows the owner to grant anything, including MANAGE_ACCESS", () => {
    const ok = canGrantCapabilities({
      granterCapabilities: 0n,
      granterIsOwner: true,
      requestedCapabilities: CAP.MANAGE_ACCESS | CAP.MANAGE_VOICE
    });
    assert.equal(ok, true);
  });

  it("allows a non-owner to grant a subset of their own capabilities", () => {
    const granterCapabilities = CAP.VIEW_LOGS | CAP.MANAGE_VOICE;
    const ok = canGrantCapabilities({
      granterCapabilities,
      granterIsOwner: false,
      requestedCapabilities: CAP.MANAGE_VOICE
    });
    assert.equal(ok, true);
  });

  it("rejects a non-owner granting a capability they do not hold", () => {
    const ok = canGrantCapabilities({
      granterCapabilities: CAP.VIEW_LOGS,
      granterIsOwner: false,
      requestedCapabilities: CAP.MANAGE_VOICE
    });
    assert.equal(ok, false);
  });

  it("rejects a non-owner granting MANAGE_ACCESS even if they hold it", () => {
    const ok = canGrantCapabilities({
      granterCapabilities: CAP.MANAGE_ACCESS,
      granterIsOwner: false,
      requestedCapabilities: CAP.MANAGE_ACCESS
    });
    assert.equal(ok, false);
  });
});

describe("capability wire (de)serialization", () => {
  it("round-trips a bigint through its decimal string form", () => {
    const value = CAP.VIEW_LOGS | CAP.MANAGE_ACCESS;
    const wire = capabilitiesToWireString(value);
    assert.equal(typeof wire, "string");
    assert.equal(parseCapabilitiesWireString(wire), value);
  });
});
