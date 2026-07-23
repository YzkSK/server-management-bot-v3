import { parseDashboardAuthEnv } from "@sm-bot/config";
import { DiscordApiError } from "@sm-bot/dashboard-access";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { authOptions } from "../../../auth";
import { getDashboardDb, getDashboardRedisClient } from "../../../server/trpc-context";
import {
  resolveDashboardAccessForRequest,
  type ResolvedDashboardAccess
} from "../../../server/resolve-dashboard-access";
import { GuildIdSync } from "./guild-id-sync";
import { GuildShell } from "./guild-shell";

const env = parseDashboardAuthEnv();

export default async function GuildLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/");
  }

  let access: ResolvedDashboardAccess;
  try {
    access = await resolveDashboardAccessForRequest({
      db: getDashboardDb(),
      cache: await getDashboardRedisClient(),
      botToken: env.DISCORD_BOT_TOKEN,
      guildId,
      userId
    });
  } catch (error) {
    // guildIdはURLバー直打ちでユーザーが自由に変更できる。Discordが
    // 404(botが参加していない/存在しないguild)を返すケースはシステム
    // エラーではなく「このguildにはアクセスできない」という通常の
    // 利用者操作なので、/gへの誘導に変換する。それ以外(401/429/5xx等)
    // は本当のエラーとして握り潰さずthrowし続ける。
    if (error instanceof DiscordApiError && error.status === 404) {
      redirect("/g");
    }
    throw error;
  }

  if (!access.isGuildOwner && access.capabilities === 0n) {
    redirect("/g");
  }

  return (
    <GuildShell guildId={guildId}>
      <GuildIdSync guildId={guildId} />
      {children}
    </GuildShell>
  );
}
