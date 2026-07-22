"use client";

import Link from "next/link";

import { trpc } from "../../trpc-client";

export type GuildSelectorState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; guilds: { id: string; name: string }[] };

export function GuildSelectorView({ state }: { state: GuildSelectorState }) {
  if (state.kind === "loading") {
    return <p>Loading...</p>;
  }

  if (state.kind === "error") {
    return <p>Error: {state.message}</p>;
  }

  if (state.guilds.length === 0) {
    return <p>No accessible guilds found.</p>;
  }

  return (
    <ul>
      {state.guilds.map((guild) => (
        <li key={guild.id}>
          <Link href={`/g/${guild.id}`}>{guild.name}</Link>
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
