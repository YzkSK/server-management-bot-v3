"use client";

import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../../components/ui/dropdown-menu";

interface NavItem {
  label: string;
  hrefSuffix: string;
}

// 将来ページを追加するときはここに1行足すだけでナビに反映される。
const NAV_ITEMS: NavItem[] = [{ label: "Logs", hrefSuffix: "/logs" }];

export function GuildShell({
  guildId,
  guildName,
  children
}: {
  guildId: string;
  guildName: string;
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
              <Link href={`/g/${guildId}/settings`}>サーバー設定</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/g">サーバーを切り替える</Link>
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
