import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DiscordGuildMemberAccess } from "./discord-guild-member-client.js";
import {
  GUILD_MEMBER_ACCESS_CACHE_TTL_SECONDS,
  resolveCachedGuildMemberAccess
} from "./guild-member-access-cache.js";

const GUILD_ID = "guild-1";
const USER_ID = "user-1";

function createFakeCache() {
  const store = new Map<string, string>();
  const setCalls: Array<{ key: string; value: string; ex: number }> = [];
  return {
    store,
    setCalls,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, options: { EX: number }) {
      store.set(key, value);
      setCalls.push({ key, value, ex: options.EX });
    }
  };
}

describe("resolveCachedGuildMemberAccess", () => {
  it("fetches and caches a member access result on a cache miss", async () => {
    const cache = createFakeCache();
    const access: DiscordGuildMemberAccess = { roleIds: ["role-a"], isGuildOwner: false };
    let fetchCalls = 0;
    const fetchGuildMemberAccess = async () => {
      fetchCalls += 1;
      return access;
    };

    const result = await resolveCachedGuildMemberAccess({
      cache,
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess
    });

    assert.deepEqual(result, access);
    assert.equal(fetchCalls, 1);
    assert.equal(cache.setCalls.length, 1);
    assert.equal(cache.setCalls[0]?.ex, GUILD_MEMBER_ACCESS_CACHE_TTL_SECONDS);
  });

  it("returns the cached result without calling fetch again on a cache hit", async () => {
    const cache = createFakeCache();
    const access: DiscordGuildMemberAccess = { roleIds: ["role-a"], isGuildOwner: false };
    let fetchCalls = 0;
    const fetchGuildMemberAccess = async () => {
      fetchCalls += 1;
      return access;
    };

    await resolveCachedGuildMemberAccess({
      cache,
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess
    });
    const result = await resolveCachedGuildMemberAccess({
      cache,
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess
    });

    assert.deepEqual(result, access);
    assert.equal(fetchCalls, 1);
  });

  it("caches a null (left-guild) result so repeated lookups don't hit the API again", async () => {
    const cache = createFakeCache();
    let fetchCalls = 0;
    const fetchGuildMemberAccess = async () => {
      fetchCalls += 1;
      return null;
    };

    const first = await resolveCachedGuildMemberAccess({
      cache,
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess
    });
    const second = await resolveCachedGuildMemberAccess({
      cache,
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess
    });

    assert.equal(first, null);
    assert.equal(second, null);
    assert.equal(fetchCalls, 1);
  });

  it("uses a cache key scoped to the guild and user", async () => {
    const cache = createFakeCache();
    const fetchGuildMemberAccess = async (): Promise<DiscordGuildMemberAccess | null> => ({
      roleIds: [],
      isGuildOwner: false
    });

    await resolveCachedGuildMemberAccess({
      cache,
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess
    });

    const [key] = [...cache.store.keys()];
    assert.match(key ?? "", new RegExp(GUILD_ID));
    assert.match(key ?? "", new RegExp(USER_ID));
  });

  it("treats a corrupted cache entry as a miss and re-fetches", async () => {
    const cache = createFakeCache();
    cache.store.set("dashboard-access:guild-member:guild-1:user-1", "not-json");
    const access: DiscordGuildMemberAccess = { roleIds: ["role-a"], isGuildOwner: false };
    let fetchCalls = 0;
    const fetchGuildMemberAccess = async () => {
      fetchCalls += 1;
      return access;
    };

    const result = await resolveCachedGuildMemberAccess({
      cache,
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess
    });

    assert.deepEqual(result, access);
    assert.equal(fetchCalls, 1);
  });

  it("treats a well-formed but schema-mismatched cache entry as a miss and re-fetches", async () => {
    const cache = createFakeCache();
    cache.store.set(
      "dashboard-access:guild-member:guild-1:user-1",
      JSON.stringify({ found: true, access: { roleIds: "not-an-array", isGuildOwner: false } })
    );
    const access: DiscordGuildMemberAccess = { roleIds: ["role-a"], isGuildOwner: false };
    let fetchCalls = 0;
    const fetchGuildMemberAccess = async () => {
      fetchCalls += 1;
      return access;
    };

    const result = await resolveCachedGuildMemberAccess({
      cache,
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess
    });

    assert.deepEqual(result, access);
    assert.equal(fetchCalls, 1);
  });
});
