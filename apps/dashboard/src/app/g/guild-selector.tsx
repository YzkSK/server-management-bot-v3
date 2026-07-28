"use client";

import Link from "next/link";

import { Card, CardContent } from "../../components/ui/card";
import { trpc } from "../../trpc-client";

export type GuildSelectorState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; guilds: { id: string; name: string }[] };

export function GuildSelectorView({ state }: { state: GuildSelectorState }) {
  if (state.kind === "loading") {
    return (
      <p role="status" aria-live="polite" className="p-4 text-sm text-muted-foreground">
        Loading...
      </p>
    );
  }

  if (state.kind === "error") {
    // tRPCの内部エラーメッセージをそのまま利用者に見せない(セキュリティ/UX上の理由)。
    // 詳細はブラウザ/サーバーのログで追跡する。
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        ギルド一覧の取得に失敗しました。
      </p>
    );
  }

  if (state.guilds.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No accessible guilds found.</p>;
  }

  return (
    <ul className="flex flex-col gap-2 p-4">
      {state.guilds.map((guild) => (
        <li key={guild.id}>
          <Link
            href={`/g/${guild.id}`}
            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="transition-colors hover:bg-muted">
              <CardContent className="text-sm font-medium">{guild.name}</CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function GuildSelector() {
  const { data, isLoading, error } = trpc.dashboardAccess.myGuilds.useQuery();

  const state: GuildSelectorState = isLoading
    ? { kind: "loading" }
    : error
      ? { kind: "error", message: error.message }
      : { kind: "loaded", guilds: data ?? [] };

  return <GuildSelectorView state={state} />;
}
