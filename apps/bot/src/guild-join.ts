import type { DbClient, ensureEveryoneBaselineGrant } from "@sm-bot/db";

export interface HandleGuildCreateInput {
  guildId: string;
  everyoneRoleId: string;
}

export interface HandleGuildCreateDeps {
  db: DbClient;
  ensureEveryoneBaselineGrant: typeof ensureEveryoneBaselineGrant;
}

export async function handleGuildCreate(
  input: HandleGuildCreateInput,
  deps: HandleGuildCreateDeps
): Promise<void> {
  await deps.ensureEveryoneBaselineGrant(deps.db, {
    guildId: input.guildId,
    everyoneRoleId: input.everyoneRoleId
  });
}
