import type { DiscordGuildMemberAccess } from "./discord-guild-member-client.js";
import { fetchGuildMemberAccess as fetchGuildMemberAccessFromDiscord } from "./discord-guild-member-client.js";

export const GUILD_MEMBER_ACCESS_CACHE_TTL_SECONDS = 60;

export interface DashboardAccessCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

export interface ResolveCachedGuildMemberAccessInput {
  cache: DashboardAccessCacheClient;
  botToken: string;
  guildId: string;
  userId: string;
  fetchGuildMemberAccess?: (input: {
    botToken: string;
    guildId: string;
    userId: string;
  }) => Promise<DiscordGuildMemberAccess | null>;
}

type CachedEntry =
  | { found: true; access: DiscordGuildMemberAccess }
  | { found: false };

function isCachedEntry(value: unknown): value is CachedEntry {
  if (typeof value !== "object" || value === null || !("found" in value)) {
    return false;
  }
  if (value.found === false) return true;
  if (value.found !== true || !("access" in value)) return false;

  const access = value.access;
  return (
    typeof access === "object" &&
    access !== null &&
    "roleIds" in access &&
    Array.isArray(access.roleIds) &&
    access.roleIds.every((id) => typeof id === "string") &&
    "isGuildOwner" in access &&
    typeof access.isGuildOwner === "boolean"
  );
}

function cacheKey(guildId: string, userId: string) {
  return `dashboard-access:guild-member:${guildId}:${userId}`;
}

// A cache hit that fails to parse (corrupted value, stale schema) is treated
// as a miss rather than surfacing as a 500 — the entry is short-lived and
// will be re-fetched from Discord and overwritten.
export async function resolveCachedGuildMemberAccess(
  input: ResolveCachedGuildMemberAccessInput
): Promise<DiscordGuildMemberAccess | null> {
  const key = cacheKey(input.guildId, input.userId);
  const cached = await input.cache.get(key);
  if (cached !== null) {
    try {
      const parsed: unknown = JSON.parse(cached);
      if (isCachedEntry(parsed)) {
        return parsed.found ? parsed.access : null;
      }
    } catch {
      // fall through to a cache miss
    }
  }

  const fetchGuildMemberAccess = input.fetchGuildMemberAccess ?? fetchGuildMemberAccessFromDiscord;
  const access = await fetchGuildMemberAccess({
    botToken: input.botToken,
    guildId: input.guildId,
    userId: input.userId
  });

  const entry: CachedEntry = access ? { found: true, access } : { found: false };
  await input.cache.set(key, JSON.stringify(entry), {
    EX: GUILD_MEMBER_ACCESS_CACHE_TTL_SECONDS
  });

  return access;
}
