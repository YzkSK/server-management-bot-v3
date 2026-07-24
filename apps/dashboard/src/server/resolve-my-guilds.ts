import { DiscordUnknownGuildError, type DashboardAccessCacheClient } from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";
import { getKnownGuildIds as getKnownGuildIdsFromDb } from "@sm-bot/db";

import { fetchCurrentUserDiscordGuilds as fetchCurrentUserDiscordGuildsFromDiscord } from "./discord-user-guilds.ts";
import { resolveDashboardAccessForRequest as resolveDashboardAccessForRequestDefault } from "./resolve-dashboard-access.ts";

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

// ユーザーが所属するギルド数だけ resolveDashboardAccessForRequest (Discordのメンバー取得API呼び出しを含む)
// を無制限に並列実行すると、多数のギルドに所属するユーザーでDiscord APIのレート制限に抵触しうる。
// そのため同時実行数をこの値に制限する(コードレビュー指摘: task-6a)。
const RESOLVE_ACCESS_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      for (let index = nextIndex++; index < items.length; index = nextIndex++) {
        results[index] = await fn(items[index] as T);
      }
    })
  );

  return results;
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

  const candidateGuilds = discordGuilds.filter((guild) => knownGuildIds.has(guild.id));

  const accessible = await mapWithConcurrency(
    candidateGuilds,
    RESOLVE_ACCESS_CONCURRENCY,
    async (guild) => {
      if (guild.owner) return { id: guild.id, name: guild.name };

      // botがguildから離脱している(Unknown Guild, code 10004)場合だけ、
      // このguildを一覧から除外して他のguildの取得を継続する。それ以外の
      // 想定外の404やbot token不備(401/403)等は運用上の異常を隠さないよう、
      // 握り潰さずthrowし続ける(issue #138)。
      try {
        const access = await resolveAccess({
          db: input.db,
          cache: input.cache,
          botToken: input.botToken,
          guildId: guild.id,
          userId: input.userId
        });

        return access.capabilities !== 0n ? { id: guild.id, name: guild.name } : null;
      } catch (error) {
        if (error instanceof DiscordUnknownGuildError) return null;
        throw error;
      }
    }
  );

  return accessible.filter((guild): guild is MyGuildSummary => guild !== null);
}
