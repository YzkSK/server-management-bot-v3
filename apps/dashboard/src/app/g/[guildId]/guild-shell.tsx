import Link from "next/link";
import type { ReactNode } from "react";

interface NavItem {
  label: string;
  hrefSuffix: string;
}

// 将来ページを追加するときはここに1行足すだけでナビに反映される。
const NAV_ITEMS: NavItem[] = [{ label: "Logs", hrefSuffix: "/logs" }];

export function GuildShell({ guildId, children }: { guildId: string; children: ReactNode }) {
  return (
    <div>
      <header>
        <span>{guildId}</span>
        <Link href="/g">Switch server</Link>
      </header>
      <nav>
        {NAV_ITEMS.map((item) => (
          <Link href={`/g/${guildId}${item.hrefSuffix}`} key={item.hrefSuffix}>
            {item.label}
          </Link>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  );
}
