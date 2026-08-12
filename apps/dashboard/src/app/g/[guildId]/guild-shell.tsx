"use client";

import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { getLocale, type Locale } from "@sm-bot/shared";

import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../../components/ui/dropdown-menu";
import { LocaleProvider } from "../../../lib/locale-context";
import { trpc } from "../../../trpc-client";

interface NavItem {
  label: string;
  hrefSuffix: string;
}

// 将来ページを追加するときはここに1行足すだけでナビに反映される。
const NAV_ITEMS: NavItem[] = [{ label: "Logs", hrefSuffix: "/logs" }];

export function GuildShellView({
  guildId,
  guildName,
  locale,
  children
}: {
  guildId: string;
  guildName: string;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="min-w-0 max-w-64" title={guildName}>
              <span className="truncate font-semibold">{guildName}</span>
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem asChild>
              <Link href={`/g/${guildId}/settings`}>{locale.guildShell.serverSettings}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/g">{locale.guildShell.switchServer}</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <nav className="flex items-center gap-4 border-b px-4 py-2">
        {NAV_ITEMS.map((item) => (
          <Link
            href={`/g/${guildId}${item.hrefSuffix}`}
            key={item.hrefSuffix}
            className="rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function GuildShell({
  guildId,
  guildName,
  children
}: {
  guildId: string;
  guildName: string;
  children: ReactNode;
}) {
  const query = trpc.guildSettings.getLanguage.useQuery({ guildId });
  const locale = getLocale(query.data?.language ?? "ja");

  return (
    <LocaleProvider value={locale}>
      <GuildShellView guildId={guildId} guildName={guildName} locale={locale}>
        {children}
      </GuildShellView>
    </LocaleProvider>
  );
}
