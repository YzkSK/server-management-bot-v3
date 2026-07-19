import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  DashboardAccessCacheClient,
  DiscordGuildMemberAccess
} from "@sm-bot/dashboard-access";
import type { DashboardAccessGrantRow } from "@sm-bot/db";
import { CAP } from "@sm-bot/shared";

import { resolveDashboardAccessForRequest } from "./resolve-dashboard-access.js";

const GUILD_ID = "guild-1";
const USER_ID = "user-1";

function createFakeCache(): DashboardAccessCacheClient {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    }
  };
}

function grantRow(overrides: Partial<DashboardAccessGrantRow>): DashboardAccessGrantRow {
  return {
    id: "grant-1",
    guildId: GUILD_ID,
    targetType: "user",
    targetId: USER_ID,
    capabilities: 0n,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe("resolveDashboardAccessForRequest", () => {
  it("returns zero capabilities and isGuildOwner=false when the member has left the guild", async () => {
    const result = await resolveDashboardAccessForRequest({
      db: {} as never,
      cache: createFakeCache(),
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess: async () => null,
      listGrantsForPrincipal: async () => {
        throw new Error("must not be called when the member has left");
      }
    });

    assert.deepEqual(result, { isGuildOwner: false, capabilities: 0n });
  });

  it("computes effective capabilities from the resolved role grants for a non-owner", async () => {
    const memberAccess: DiscordGuildMemberAccess = {
      roleIds: ["role-a"],
      isGuildOwner: false
    };
    let listGrantsInput: unknown;
    const result = await resolveDashboardAccessForRequest({
      db: {} as never,
      cache: createFakeCache(),
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess: async () => memberAccess,
      listGrantsForPrincipal: async (_db, input) => {
        listGrantsInput = input;
        return [grantRow({ capabilities: CAP.VIEW_LOGS })];
      }
    });

    assert.deepEqual(listGrantsInput, {
      guildId: GUILD_ID,
      userId: USER_ID,
      roleIds: ["role-a"]
    });
    assert.deepEqual(result, { isGuildOwner: false, capabilities: CAP.VIEW_LOGS });
  });

  it("grants all capabilities when the member is the guild owner", async () => {
    const memberAccess: DiscordGuildMemberAccess = { roleIds: [], isGuildOwner: true };
    const result = await resolveDashboardAccessForRequest({
      db: {} as never,
      cache: createFakeCache(),
      botToken: "token",
      guildId: GUILD_ID,
      userId: USER_ID,
      fetchGuildMemberAccess: async () => memberAccess,
      listGrantsForPrincipal: async () => []
    });

    assert.equal(result.isGuildOwner, true);
    assert.ok(result.capabilities > 0n);
  });
});
