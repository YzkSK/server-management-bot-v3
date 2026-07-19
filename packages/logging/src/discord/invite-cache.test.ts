import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInviteCache } from "./invite-cache.js";

function fakeInvite(overrides: Record<string, unknown> = {}) {
  return {
    code: "abc123",
    url: "https://discord.gg/abc123",
    maxAge: 86400,
    maxUses: 10,
    temporary: false,
    uses: 0,
    inviter: { id: "member-1" },
    ...overrides
  } as never;
}

function fakeGuild(fetch: () => Promise<Map<string, unknown>>) {
  return {
    id: "guild-1",
    invites: { fetch }
  } as never;
}

describe("createInviteCache", () => {
  it("returns null from getAndDelete for an unknown guild", () => {
    const cache = createInviteCache();

    assert.equal(cache.getAndDelete("guild-1", "abc123"), null);
  });

  it("set then getAndDelete round-trips a cached invite and removes it", () => {
    const cache = createInviteCache();

    cache.set("guild-1", fakeInvite());
    const cached = cache.getAndDelete("guild-1", "abc123");

    assert.deepEqual(cached, {
      code: "abc123",
      url: "https://discord.gg/abc123",
      maxAge: 86400,
      maxUses: 10,
      temporary: false,
      uses: 0,
      inviterId: "member-1"
    });
    assert.equal(cache.getAndDelete("guild-1", "abc123"), null);
  });

  it("initGuild populates the cache from guild.invites.fetch", async () => {
    const cache = createInviteCache();
    const guild = fakeGuild(async () => new Map([["abc123", fakeInvite()]]));

    await cache.initGuild(guild);

    assert.deepEqual(cache.getAndDelete("guild-1", "abc123"), {
      code: "abc123",
      url: "https://discord.gg/abc123",
      maxAge: 86400,
      maxUses: 10,
      temporary: false,
      uses: 0,
      inviterId: "member-1"
    });
  });

  it("swallows errors from initGuild (e.g. missing MANAGE_GUILD permission)", async () => {
    const cache = createInviteCache();
    const guild = fakeGuild(async () => {
      throw new Error("missing permission");
    });

    await assert.doesNotReject(cache.initGuild(guild));
    assert.equal(cache.getAndDelete("guild-1", "abc123"), null);
  });
});
