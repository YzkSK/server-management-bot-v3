import { parseDashboardAuthEnv } from "@sm-bot/config";
import { DiscordApiError, type DashboardAccessContext } from "@sm-bot/dashboard-access";
import { createDbConnection, type DbClient } from "@sm-bot/db";
import { getToken as getTokenDefault } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { createClient, type RedisClientType } from "redis";

import {
  resolveDashboardAccessForRequest as resolveDashboardAccessForRequestDefault,
  type ResolvedDashboardAccess
} from "./resolve-dashboard-access";

const env = parseDashboardAuthEnv();

let db: DbClient | null = null;
export function getDashboardDb(): DbClient {
  db ??= createDbConnection(env.DATABASE_URL).db;
  return db;
}

let redisClient: RedisClientType | null = null;
let redisReady: Promise<void> | null = null;
export async function getDashboardRedisClient(): Promise<RedisClientType> {
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

export interface CreateContextDeps {
  getToken?: typeof getTokenDefault;
  resolveDashboardAccessForRequest?: typeof resolveDashboardAccessForRequestDefault;
  getDashboardDb?: typeof getDashboardDb;
  getDashboardRedisClient?: typeof getDashboardRedisClient;
}

export async function createContext(
  req: NextRequest,
  deps: CreateContextDeps = {}
): Promise<DashboardAccessContext> {
  const getToken = deps.getToken ?? getTokenDefault;
  const resolveDashboardAccessForRequest =
    deps.resolveDashboardAccessForRequest ?? resolveDashboardAccessForRequestDefault;
  const getDb = deps.getDashboardDb ?? getDashboardDb;
  const getRedisClient = deps.getDashboardRedisClient ?? getDashboardRedisClient;

  // Discordのbearer tokenはクライアントへ晒したくないため、/api/auth/sessionを
  // 経由するgetServerSessionではなく、暗号化されたJWTをサーバー側だけで読める
  // getTokenから取得する(session callbackにはdiscordAccessTokenを含めない)。
  const token = await getToken({ req, secret: env.NEXTAUTH_SECRET });
  const userId = token?.sub ?? null;
  const discordAccessToken = token?.discordAccessToken ?? null;
  const guildId = req.headers.get("x-guild-id");

  if (!userId || !guildId) {
    return { userId, guildId, isGuildOwner: false, capabilities: 0n, discordAccessToken };
  }

  let access: ResolvedDashboardAccess;
  try {
    access = await resolveDashboardAccessForRequest({
      db: getDb(),
      cache: await getRedisClient(),
      botToken: env.DISCORD_BOT_TOKEN,
      guildId,
      userId
    });
  } catch (error) {
    // guildIdはクライアントが自由に設定できるヘッダー値。Discordが404(botが
    // 参加していない/存在しないguild)を返すケースは、layout.tsxの/gリダイレクトと
    // 同様に「アクセス不可」として扱い、tRPC呼び出し全体を失敗させない。
    if (error instanceof DiscordApiError && error.status === 404) {
      return { userId, guildId, isGuildOwner: false, capabilities: 0n, discordAccessToken };
    }
    throw error;
  }

  return { userId, guildId, discordAccessToken, ...access };
}
