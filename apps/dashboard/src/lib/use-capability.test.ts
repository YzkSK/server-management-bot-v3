import { describe, expect, test } from "bun:test";

import { CAP } from "@sm-bot/shared";

import { hasCapabilityFromWireString } from "./use-capability";

describe("hasCapabilityFromWireString", () => {
  test("returns false when the wire string is undefined (still loading)", () => {
    expect(hasCapabilityFromWireString(undefined, CAP.VIEW_LOGS_RAW)).toBe(false);
  });

  test("returns true when the capability bit is present", () => {
    const wire = (CAP.VIEW_LOGS | CAP.VIEW_LOGS_RAW).toString(10);
    expect(hasCapabilityFromWireString(wire, CAP.VIEW_LOGS_RAW)).toBe(true);
  });

  test("returns false when the capability bit is absent", () => {
    const wire = CAP.VIEW_LOGS.toString(10);
    expect(hasCapabilityFromWireString(wire, CAP.VIEW_LOGS_RAW)).toBe(false);
  });
});
