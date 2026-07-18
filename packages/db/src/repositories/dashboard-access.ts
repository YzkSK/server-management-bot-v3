import { and, eq, inArray, or, sql } from "drizzle-orm";

import { BASELINE_EVERYONE_CAPABILITIES } from "@sm-bot/shared";

import type { DbClient } from "../client.js";
import { dashboardAccessGrants, guilds } from "../schema/index.js";

export interface EnsureEveryoneBaselineGrantInput {
  guildId: string;
  everyoneRoleId: string;
}

export async function ensureEveryoneBaselineGrant(
  db: DbClient,
  input: EnsureEveryoneBaselineGrantInput
): Promise<{ created: boolean }> {
  return db.transaction(async (tx) => {
    await tx
      .insert(guilds)
      .values({ guildId: input.guildId })
      .onConflictDoUpdate({
        target: guilds.guildId,
        set: {
          isActive: true,
          updatedAt: sql`now()`
        }
      });

    const inserted = await tx
      .insert(dashboardAccessGrants)
      .values({
        guildId: input.guildId,
        targetType: "role",
        targetId: input.everyoneRoleId,
        capabilities: BASELINE_EVERYONE_CAPABILITIES
      })
      .onConflictDoNothing({
        target: [
          dashboardAccessGrants.guildId,
          dashboardAccessGrants.targetType,
          dashboardAccessGrants.targetId
        ]
      })
      .returning({ id: dashboardAccessGrants.id });

    return { created: inserted.length > 0 };
  });
}

export interface ListGrantsForPrincipalInput {
  guildId: string;
  userId: string;
  roleIds: string[];
}

export type DashboardAccessGrantRow = typeof dashboardAccessGrants.$inferSelect;

export async function listGrantsForPrincipal(
  db: DbClient,
  input: ListGrantsForPrincipalInput
): Promise<DashboardAccessGrantRow[]> {
  const userFilter = and(
    eq(dashboardAccessGrants.targetType, "user"),
    eq(dashboardAccessGrants.targetId, input.userId)
  );

  const principalFilter =
    input.roleIds.length === 0
      ? userFilter
      : or(
          userFilter,
          and(
            eq(dashboardAccessGrants.targetType, "role"),
            inArray(dashboardAccessGrants.targetId, input.roleIds)
          )
        );

  return db
    .select()
    .from(dashboardAccessGrants)
    .where(and(eq(dashboardAccessGrants.guildId, input.guildId), principalFilter));
}
