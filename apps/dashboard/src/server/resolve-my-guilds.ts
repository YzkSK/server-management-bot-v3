import type { DashboardAccessCacheClient } from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";
import { getKnownGuildIds as getKnownGuildIdsFromDb } from "@sm-bot/db";

import { fetchCurrentUserDiscordGuilds as fetchCurrentUserDiscordGuildsFromDiscord } from "./discord-user-guilds.js";
import { resolveDashboardAccessForRequest as resolveDashboardAccessForRequestDefault } from "./resolve-dashboard-access.js";

export interface ResolveMyGuildsInput {
  db: DbClient;
  cache: DashboardAccessCacheClient;
  botToken: string;
  userId: string;
  discordAccessToken: string;
  fetchCurrentUserDiscordGuilds?: typeof fetchCurrentUserDiscordGuildsFromDiscord;
  getKnownGuildIds?: typeof getKnownGuildIdsFromDb;
  resolveDashboardAccessForRequest?: typeof resolveDashboardAccessForRequestDefault;
}

export interface MyGuildSummary {
  id: string;
  name: string;
}

export async function resolveMyGuilds(input: ResolveMyGuildsInput): Promise<MyGuildSummary[]> {
  const fetchGuilds = input.fetchCurrentUserDiscordGuilds ?? fetchCurrentUserDiscordGuildsFromDiscord;
  const getKnownGuildIds = input.getKnownGuildIds ?? getKnownGuildIdsFromDb;
  const resolveAccess = input.resolveDashboardAccessForRequest ?? resolveDashboardAccessForRequestDefault;

  const discordGuilds = await fetchGuilds(input.discordAccessToken);
  const knownGuildIds = await getKnownGuildIds(
    input.db,
    discordGuilds.map((guild) => guild.id)
  );

  const accessible = await Promise.all(
    discordGuilds
      .filter((guild) => knownGuildIds.has(guild.id))
      .map(async (guild) => {
        if (guild.owner) return { id: guild.id, name: guild.name };

        const access = await resolveAccess({
          db: input.db,
          cache: input.cache,
          botToken: input.botToken,
          guildId: guild.id,
          userId: input.userId
        });

        return access.capabilities !== 0n ? { id: guild.id, name: guild.name } : null;
      })
  );

  return accessible.filter((guild): guild is MyGuildSummary => guild !== null);
}
