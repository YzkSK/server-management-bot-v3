import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";

import type { DashboardAccessContext } from "@sm-bot/dashboard-access";

import { authOptions } from "../auth";

export async function createContext(_req: NextRequest): Promise<DashboardAccessContext> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  // Guild-scoped owner status and effective capabilities require knowing
  // which guild the request is for (not yet — no guild-scoped routes exist
  // in this foundation plan) and a live DbClient (also not wired yet — see
  // dashboard-access-router.ts's `grant` procedure note). Until then every
  // authenticated user resolves to zero capabilities and non-owner, which is
  // a safe default: `me` still proves the auth flow works, and `grant` is
  // unreachable because `requireCapability(CAP.MANAGE_ACCESS)` will reject
  // it. This constraint is resolved in the next phase.
  return { userId, guildId: null, isGuildOwner: false, capabilities: 0n };
}
