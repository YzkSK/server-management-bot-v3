import { describe, expect, test } from "bun:test";

import { currentGuildIdRef, setCurrentGuildId } from "./guild-context";

describe("setCurrentGuildId", () => {
  test("updates currentGuildIdRef.current", () => {
    setCurrentGuildId("guild-1");
    expect(currentGuildIdRef.current).toBe("guild-1");

    setCurrentGuildId(null);
    expect(currentGuildIdRef.current).toBeNull();
  });
});
