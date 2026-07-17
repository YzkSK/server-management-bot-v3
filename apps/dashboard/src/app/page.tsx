"use client";

import { signIn } from "next-auth/react";

import { trpc } from "../trpc-client";

export default function HomePage() {
  const { data, isLoading, error } = trpc.dashboardAccess.me.useQuery();

  if (isLoading) {
    return <main>Loading...</main>;
  }

  if (error) {
    if (error.data?.code === "UNAUTHORIZED") {
      return (
        <main>
          <p>Not logged in.</p>
          <button onClick={() => signIn("discord")}>Login with Discord</button>
        </main>
      );
    }

    return <main>Error: {error.message}</main>;
  }

  if (!data) {
    return null;
  }

  return (
    <main>
      <p>Logged in as {data.userId}</p>
      <p>Guild owner: {data.isGuildOwner ? "yes" : "no"}</p>
      <p>Capabilities: {data.capabilities}</p>
    </main>
  );
}
