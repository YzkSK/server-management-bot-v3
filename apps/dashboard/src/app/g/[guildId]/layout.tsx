import { parseDashboardAuthEnv } from "@sm-bot/config";
import { DiscordUnknownGuildError, fetchGuildInfo } from "@sm-bot/dashboard-access";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { authOptions } from "../../../auth";
import { getDashboardDb, getDashboardRedisClient } from "../../../server/trpc-context";
import {
  resolveDashboardAccessForRequest,
  type ResolvedDashboardAccess
} from "../../../server/resolve-dashboard-access";
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
    // guildIdはURLバー直打ちでユーザーが自由に変更できる。DiscordがUnknown
    // Guild(code 10004)を返すケースはシステムエラーではなく「このguildには
    // アクセスできない」という通常の利用者操作なので、/gへの誘導に変換する。
    // それ以外(未知の404・401/429/5xx等)は本当のエラーとして握り潰さず
    // throwし続ける(issue #138)。
    if (error instanceof DiscordUnknownGuildError) {
      redirect("/g");
    }
    throw error;
  }

  if (!access.isGuildOwner && access.capabilities === 0n) {
    redirect("/g");
  }

  let guildName: string;
  try {
    guildName = (await fetchGuildInfo(env.DISCORD_BOT_TOKEN, guildId)).name;
  } catch (error) {
    // resolveDashboardAccessForRequestの権限キャッシュが残っている間にbotが
    // guildから外れた等、ここでもUnknown Guildはシステムエラーではなく
    // 「アクセス不可」として扱う(上のresolveDashboardAccessForRequestと同じ方針)。
    if (error instanceof DiscordUnknownGuildError) {
      redirect("/g");
    }
    throw error;
  }

  return (
    <GuildShell guildId={guildId} guildName={guildName}>
      {children}
    </GuildShell>
  );
}
