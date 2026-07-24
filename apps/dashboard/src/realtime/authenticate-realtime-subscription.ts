import { CAP, hasCapability } from "@sm-bot/shared";
import { DiscordUnknownGuildError, type DashboardAccessCacheClient } from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";
import { getToken as getTokenDefault } from "next-auth/jwt";

import type { RealtimeLogsErrorReason } from "@sm-bot/shared";

import {
  resolveDashboardAccessForRequest as resolveDashboardAccessForRequestDefault
} from "../server/resolve-dashboard-access";
import { parseCookieHeader } from "./parse-cookie-header";

export interface AuthenticateRealtimeSubscriptionInput {
  headers: Record<string, string | string[] | undefined>;
  guildId: string;
  nextAuthSecret: string;
  botToken: string;
  db: DbClient;
  cache: DashboardAccessCacheClient;
}

export type AuthenticateRealtimeSubscriptionResult =
  | { ok: true; userId: string; canViewRaw: boolean }
  | { ok: false; reason: RealtimeLogsErrorReason };

export interface AuthenticateRealtimeSubscriptionDeps {
  getToken?: typeof getTokenDefault;
  resolveDashboardAccessForRequest?: typeof resolveDashboardAccessForRequestDefault;
}

export async function authenticateRealtimeSubscription(
  input: AuthenticateRealtimeSubscriptionInput,
  deps: AuthenticateRealtimeSubscriptionDeps = {}
): Promise<AuthenticateRealtimeSubscriptionResult> {
  const getToken = deps.getToken ?? getTokenDefault;
  const resolveDashboardAccessForRequest =
    deps.resolveDashboardAccessForRequest ?? resolveDashboardAccessForRequestDefault;

  const cookieHeader = input.headers.cookie;
  const cookies = parseCookieHeader(typeof cookieHeader === "string" ? cookieHeader : undefined);

  // next-auth/jwtのgetTokenは req.cookies(プレーンオブジェクト) / req.headers を読む。
  // socket.io handshakeはNextRequestではなくraw IncomingMessageなので、
  // 最小限の互換シェイプをここで組み立てる。
  const token = await getToken({
    req: { headers: input.headers, cookies } as never,
    secret: input.nextAuthSecret
  });

  const userId = token?.sub;
  if (!userId) {
    return { ok: false, reason: "unauthenticated" };
  }

  let access;
  try {
    access = await resolveDashboardAccessForRequest({
      db: input.db,
      cache: input.cache,
      botToken: input.botToken,
      guildId: input.guildId,
      userId
    });
  } catch (error) {
    if (error instanceof DiscordUnknownGuildError) {
      return { ok: false, reason: "forbidden" };
    }
    throw error;
  }

  if (!hasCapability(access.capabilities, CAP.VIEW_LOGS)) {
    return { ok: false, reason: "forbidden" };
  }

  return {
    ok: true,
    userId,
    canViewRaw: hasCapability(access.capabilities, CAP.VIEW_LOGS_RAW)
  };
}
