import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbClient } from "../client.js";
import { guilds } from "../schema/index.js";

export async function upsertGuild(
  db: Pick<DbClient, "insert">,
  guildId: string
): Promise<void> {
  await db
    .insert(guilds)
    .values({ guildId })
    .onConflictDoUpdate({
      target: guilds.guildId,
      set: {
        isActive: true,
        updatedAt: sql`now()`
      }
    });
}

export async function getKnownGuildIds(
  db: Pick<DbClient, "select">,
  guildIds: string[]
): Promise<Set<string>> {
  if (guildIds.length === 0) return new Set();

  const rows = await db
    .select({ guildId: guilds.guildId })
    .from(guilds)
    .where(and(inArray(guilds.guildId, guildIds), eq(guilds.isActive, true)));

  return new Set(rows.map((row) => row.guildId));
}
