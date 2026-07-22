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

  it("bounds concurrent resolveDashboardAccessForRequest calls", async () => {
    const discordGuilds: DiscordUserGuild[] = Array.from({ length: 12 }, (_, index) => ({
      id: `guild-${index}`,
      name: `Guild ${index}`,
      owner: false
    }));

    let inFlight = 0;
    let maxInFlight = 0;

    const result = await resolveMyGuilds({
      ...BASE_INPUT,
      fetchCurrentUserDiscordGuilds: async () => discordGuilds,
      getKnownGuildIds: async () => new Set(discordGuilds.map((guild) => guild.id)),
      resolveDashboardAccessForRequest: async ({ guildId }: { guildId: string }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight -= 1;
        return {
          isGuildOwner: false,
          capabilities: guildId === "guild-0" ? CAP.VIEW_LOGS : 0n
        };
      }
    });

    assert.ok(maxInFlight <= 5, `expected max in-flight calls <= 5, got ${maxInFlight}`);
    assert.deepEqual(result, [{ id: "guild-0", name: "Guild 0" }]);
  });
});
