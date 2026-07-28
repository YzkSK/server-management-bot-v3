import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "../../../components/ui/button";

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
        <span className="text-sm font-semibold">{guildName}</span>
        <Button asChild variant="outline" size="sm">
          <Link href="/g">Switch server</Link>
        </Button>
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
