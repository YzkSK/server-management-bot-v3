import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TRPCError } from "@trpc/server";

import { CAP, type GuildLanguage } from "@sm-bot/shared";
import type { DashboardAccessContext } from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";

import { createGuildSettingsRouter } from "./guild-settings-router.js";

function context(overrides: Partial<DashboardAccessContext> = {}): DashboardAccessContext {
  return {
    userId: "user-1",
    guildId: "guild-1",
    isGuildOwner: false,
    capabilities: 0n,
    discordAccessToken: null,
    ...overrides
  };
}

const FAKE_DB = {} as DbClient;

describe("guildSettingsRouter.getLanguage", () => {
  it("succeeds for a caller with no capabilities, as long as guildId matches", async () => {
    let capturedGuildId: string | undefined;
    const caller = createGuildSettingsRouter({
      getDb: () => FAKE_DB,
      getGuildLanguage: async (_db, guildId) => {
        capturedGuildId = guildId;
        return "ja";
      }
    }).createCaller(context({ capabilities: 0n }));

    const result = await caller.getLanguage({ guildId: "guild-1" });

    assert.deepEqual(result, { language: "ja" });
    assert.equal(capturedGuildId, "guild-1");
  });

  it("returns the guild's current language", async () => {
    let capturedGuildId: string | undefined;
    const caller = createGuildSettingsRouter({
      getDb: () => FAKE_DB,
      getGuildLanguage: async (_db, guildId) => {
        capturedGuildId = guildId;
        return "en";
      }
    }).createCaller(context({ capabilities: CAP.MANAGE_GUILD_SETTINGS }));

    const result = await caller.getLanguage({ guildId: "guild-1" });

    assert.deepEqual(result, { language: "en" });
    assert.equal(capturedGuildId, "guild-1");
  });

  it("rejects when input.guildId doesn't match the caller's authorized guild", async () => {
    const caller = createGuildSettingsRouter({
      getDb: () => FAKE_DB,
      getGuildLanguage: async () => "ja"
    }).createCaller(context({ guildId: "guild-1", capabilities: CAP.MANAGE_GUILD_SETTINGS }));

    await assert.rejects(
      () => caller.getLanguage({ guildId: "guild-2" }),
      (error) => {
        assert.ok(error instanceof TRPCError);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      }
    );
  });
});

describe("guildSettingsRouter.setLanguage", () => {
  it("rejects a caller without MANAGE_GUILD_SETTINGS", async () => {
    const caller = createGuildSettingsRouter({
      getDb: () => FAKE_DB,
      setGuildLanguage: async (_db, _guildId, language) => ({ language }) as never
    }).createCaller(context({ capabilities: 0n }));

    await assert.rejects(
      () => caller.setLanguage({ language: "en" }),
      (error) => {
        assert.ok(error instanceof TRPCError);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("rejects an unknown language value", async () => {
    const caller = createGuildSettingsRouter({ getDb: () => FAKE_DB }).createCaller(
      context({ capabilities: CAP.MANAGE_GUILD_SETTINGS })
    );

    await assert.rejects(() => caller.setLanguage({ language: "fr" as never }));
  });

  it("throws INTERNAL_SERVER_ERROR when guildId is missing after capability check", async () => {
    const caller = createGuildSettingsRouter({
      getDb: () => FAKE_DB,
      setGuildLanguage: async () => {
        throw new Error("must not be called when guildId is missing");
      }
    }).createCaller(context({ guildId: null, capabilities: CAP.MANAGE_GUILD_SETTINGS }));

    await assert.rejects(
      () => caller.setLanguage({ language: "en" }),
      (error) => {
        assert.ok(error instanceof TRPCError);
        assert.equal(error.code, "INTERNAL_SERVER_ERROR");
        return true;
      }
    );
  });

  it("persists the new language for the caller's guild and returns it", async () => {
    let captured: { guildId?: string; language?: GuildLanguage } = {};
    const caller = createGuildSettingsRouter({
      getDb: () => FAKE_DB,
      setGuildLanguage: async (_db, guildId, language) => {
        captured = { guildId, language };
        return { language } as never;
      }
    }).createCaller(context({ capabilities: CAP.MANAGE_GUILD_SETTINGS }));

    const result = await caller.setLanguage({ language: "en" });

    assert.deepEqual(result, { language: "en" });
    assert.deepEqual(captured, { guildId: "guild-1", language: "en" });
  });
});
