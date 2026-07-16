import { BASELINE_EVERYONE_CAPABILITIES } from "@sm-bot/shared";

import type { DbClient } from "../client.js";
import { dashboardAccessGrants } from "../schema/index.js";

export interface EnsureEveryoneBaselineGrantInput {
  guildId: string;
  everyoneRoleId: string;
}

export async function ensureEveryoneBaselineGrant(
  db: DbClient,
  input: EnsureEveryoneBaselineGrantInput
): Promise<{ created: boolean }> {
  const inserted = await db
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
}
