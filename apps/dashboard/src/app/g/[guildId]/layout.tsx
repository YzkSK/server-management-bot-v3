import { parseDashboardAuthEnv } from "@sm-bot/config";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { authOptions } from "../../../auth";
import { getDashboardDb, getDashboardRedisClient } from "../../../server/trpc-context";
import { resolveDashboardAccessForRequest } from "../../../server/resolve-dashboard-access";
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

  const access = await resolveDashboardAccessForRequest({
    db: getDashboardDb(),
    cache: await getDashboardRedisClient(),
    botToken: env.DISCORD_BOT_TOKEN,
    guildId,
    userId
  });

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
