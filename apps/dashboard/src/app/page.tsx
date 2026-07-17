"use client";

import { signIn } from "next-auth/react";

import { trpc } from "../trpc-client";

export type HomePageState =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string }
  | { kind: "authorized"; data: { userId: string; isGuildOwner: boolean; capabilities: string } };

export function HomePageView({ state }: { state: HomePageState }) {
  if (state.kind === "loading") {
    return <main>Loading...</main>;
  }

  if (state.kind === "unauthorized") {
    return (
      <main>
        <p>Not logged in.</p>
        <button onClick={() => signIn("discord")}>Login with Discord</button>
      </main>
    );
  }

  if (state.kind === "error") {
    return <main>Error: {state.message}</main>;
  }

  return (
    <main>
      <p>Logged in as {state.data.userId}</p>
      <p>Guild owner: {state.data.isGuildOwner ? "yes" : "no"}</p>
      <p>Capabilities: {state.data.capabilities}</p>
    </main>
  );
}

export default function HomePage() {
  const { data, isLoading, error } = trpc.dashboardAccess.me.useQuery();

  const state: HomePageState = isLoading
    ? { kind: "loading" }
    : error
      ? error.data?.code === "UNAUTHORIZED"
        ? { kind: "unauthorized" }
        : { kind: "error", message: error.message }
      : data
        ? { kind: "authorized", data }
        : { kind: "loading" };

  return <HomePageView state={state} />;
}
