import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAP } from "@sm-bot/shared";

import type { DiscordUserGuild } from "./discord-user-guilds.js";
import { resolveMyGuilds } from "./resolve-my-guilds.js";

const BASE_INPUT = {
  db: {} as never,
  cache: {} as never,
  botToken: "bot-token",
  userId: "user-1",
  discordAccessToken: "discord-token"
};

describe("resolveMyGuilds", () => {
  it("always includes guilds the user owns, without checking capabilities", async () => {
    const discordGuilds: DiscordUserGuild[] = [{ id: "guild-1", name: "Owned By Me", owner: true }];

    const result = await resolveMyGuilds({
      ...BASE_INPUT,
      fetchCurrentUserDiscordGuilds: async () => discordGuilds,
      getKnownGuildIds: async () => new Set(["guild-1"]),
      resolveDashboardAccessForRequest: async () => {
        throw new Error("should not be called for an owned guild");
      }
    });

    assert.deepEqual(result, [{ id: "guild-1", name: "Owned By Me" }]);
  });

  it("excludes guilds the bot has not joined", async () => {
    const discordGuilds: DiscordUserGuild[] = [
      { id: "guild-1", name: "Bot Not Installed", owner: false }
    ];

    const result = await resolveMyGuilds({
      ...BASE_INPUT,
      fetchCurrentUserDiscordGuilds: async () => discordGuilds,
      getKnownGuildIds: async () => new Set(),
      resolveDashboardAccessForRequest: async () => {
        throw new Error("should not be called for a guild the bot hasn't joined");
      }
    });

    assert.deepEqual(result, []);
  });

  it("excludes non-owned guilds with zero effective capabilities", async () => {
    const discordGuilds: DiscordUserGuild[] = [
      { id: "guild-1", name: "Has Capability", owner: false },
      { id: "guild-2", name: "No Capability", owner: false }
    ];

    const result = await resolveMyGuilds({
      ...BASE_INPUT,
      fetchCurrentUserDiscordGuilds: async () => discordGuilds,
      getKnownGuildIds: async () => new Set(["guild-1", "guild-2"]),
      resolveDashboardAccessForRequest: async ({ guildId }: { guildId: string }) =>
        guildId === "guild-1"
          ? { isGuildOwner: false, capabilities: CAP.VIEW_LOGS }
          : { isGuildOwner: false, capabilities: 0n }
    });

    assert.deepEqual(result, [{ id: "guild-1", name: "Has Capability" }]);
  });
});
