import { parseDashboardAuthEnv } from "@sm-bot/config";
import type { DashboardAccessContext } from "@sm-bot/dashboard-access";
import { createDbConnection, type DbClient } from "@sm-bot/db";
import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { createClient, type RedisClientType } from "redis";

import { authOptions } from "../auth";
import { resolveDashboardAccessForRequest } from "./resolve-dashboard-access";

const env = parseDashboardAuthEnv();

let db: DbClient | null = null;
function getDb(): DbClient {
  db ??= createDbConnection(env.DATABASE_URL).db;
  return db;
}

let redisClient: RedisClientType | null = null;
let redisReady: Promise<void> | null = null;
async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    const client: RedisClientType = createClient({ url: env.REDIS_URL });
    client.on("error", (error: unknown) => {
      console.error("dashboard: redis client error", error);
    });
    redisClient = client;
    redisReady = client.connect().then(
      () => undefined,
      (error: unknown) => {
        redisClient = null;
        redisReady = null;
        throw error;
      }
    );
  }
  await redisReady;
  return redisClient;
}

export async function createContext(_req: NextRequest): Promise<DashboardAccessContext> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  // No guild-scoped routes exist yet, so no request can supply a guildId
  // (tracked as a follow-up issue). Once wired, the branch below already
  // computes real effective capabilities via resolveDashboardAccessForRequest.
  const guildId: string | null = null;

  if (!userId || !guildId) {
    return { userId, guildId, isGuildOwner: false, capabilities: 0n };
  }

  const access = await resolveDashboardAccessForRequest({
    db: getDb(),
    cache: await getRedisClient(),
    botToken: env.DISCORD_BOT_TOKEN,
    guildId,
    userId
  });

  return { userId, guildId, ...access };
}
