import { eq } from "drizzle-orm";

import type { DbClient } from "../client.js";
import { guildConfigs, guildLogModes, type GuildLogMode } from "../schema/index.js";

const DEFAULT_LOG_MODE: GuildLogMode = "full";

export function isGuildLogMode(value: string): value is GuildLogMode {
  return (guildLogModes as readonly string[]).includes(value);
}

export async function getGuildLogMode(
  db: DbClient,
  guildId: string
): Promise<GuildLogMode> {
  const [config] = await db
    .select({ logMode: guildConfigs.logMode })
    .from(guildConfigs)
    .where(eq(guildConfigs.guildId, guildId))
    .limit(1);

  if (!config) {
    return DEFAULT_LOG_MODE;
  }

  if (!isGuildLogMode(config.logMode)) {
    throw new Error(`Unexpected guild log mode value: ${config.logMode}`);
  }

  return config.logMode;
}

export async function setGuildLogMode(
  db: DbClient,
  guildId: string,
  logMode: GuildLogMode
) {
  const [config] = await db
    .insert(guildConfigs)
    .values({ guildId, logMode })
    .onConflictDoUpdate({
      target: guildConfigs.guildId,
      set: { logMode, updatedAt: new Date() }
    })
    .returning();

  if (!config) {
    throw new Error("Failed to upsert guild config.");
  }

  return config;
}
