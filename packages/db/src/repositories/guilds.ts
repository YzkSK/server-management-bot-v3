import { sql } from "drizzle-orm";

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
