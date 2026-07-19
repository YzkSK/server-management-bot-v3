import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeGuildUpdate } from "./guild-events.js";

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: "guild-1",
    name: "My Guild",
    description: null,
    ownerId: "owner-1",
    preferredLocale: "ja",
    verificationLevel: 1,
    premiumTier: 0,
    ...overrides
  } as never;
}

describe("normalizeGuildUpdate", () => {
  it("returns null when nothing tracked changed", () => {
    const event = normalizeGuildUpdate(fakeGuild(), fakeGuild());

    assert.equal(event, null);
  });

  it("normalizes an update when the name changed", () => {
    const event = normalizeGuildUpdate(
      fakeGuild({ name: "Old Name" }),
      fakeGuild({ name: "New Name" })
    );

    assert.ok(event);
    assert.equal(event?.eventName, "guild.update");
    assert.equal(event?.guildId, "guild-1");
    assert.equal(event?.actorId, null);
    assert.deepEqual(event?.payload.changes, {
      name: { before: "Old Name", after: "New Name" }
    });
  });
});
