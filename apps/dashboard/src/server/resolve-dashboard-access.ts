import type { DashboardAccessCacheClient, DiscordGuildMemberAccess } from "@sm-bot/dashboard-access";
import {
  fetchGuildMemberAccess as fetchGuildMemberAccessFromDiscord,
  resolveCachedGuildMemberAccess,
  resolveEffectiveCapabilities
} from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";
import {
  listGrantsForPrincipal as listGrantsForPrincipalFromDb,
  type ListGrantsForPrincipalInput,
  type DashboardAccessGrantRow
} from "@sm-bot/db";

export interface ResolveDashboardAccessForRequestInput {
  db: DbClient;
  cache: DashboardAccessCacheClient;
  botToken: string;
  guildId: string;
  userId: string;
  fetchGuildMemberAccess?: (input: {
    botToken: string;
    guildId: string;
    userId: string;
  }) => Promise<DiscordGuildMemberAccess | null>;
  listGrantsForPrincipal?: (
    db: DbClient,
    input: ListGrantsForPrincipalInput
  ) => Promise<DashboardAccessGrantRow[]>;
}

export interface ResolvedDashboardAccess {
  isGuildOwner: boolean;
  capabilities: bigint;
}

export async function resolveDashboardAccessForRequest(
  input: ResolveDashboardAccessForRequestInput
): Promise<ResolvedDashboardAccess> {
  const fetchGuildMemberAccess = input.fetchGuildMemberAccess ?? fetchGuildMemberAccessFromDiscord;
  const listGrantsForPrincipal = input.listGrantsForPrincipal ?? listGrantsForPrincipalFromDb;

  const memberAccess = await resolveCachedGuildMemberAccess({
    cache: input.cache,
    botToken: input.botToken,
    guildId: input.guildId,
    userId: input.userId,
    fetchGuildMemberAccess
  });

  if (!memberAccess) {
    return { isGuildOwner: false, capabilities: 0n };
  }

  const grants = await listGrantsForPrincipal(input.db, {
    guildId: input.guildId,
    userId: input.userId,
    roleIds: memberAccess.roleIds
  });

  const capabilities = resolveEffectiveCapabilities({
    grants,
    isGuildOwner: memberAccess.isGuildOwner
  });

  return { isGuildOwner: memberAccess.isGuildOwner, capabilities };
}
