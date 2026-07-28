"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { trpc } from "../trpc-client";

export type HomePageState =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string }
  | { kind: "authorized"; data: { userId: string; isGuildOwner: boolean; capabilities: string } };

export function HomePageView({ state }: { state: HomePageState }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        {state.kind === "loading" ? (
          <CardContent>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              Loading...
            </p>
          </CardContent>
        ) : null}

        {state.kind === "unauthorized" ? (
          <>
            <CardHeader>
              <CardTitle>Not logged in.</CardTitle>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={() => signIn("discord")}>
                Login with Discord
              </Button>
            </CardContent>
          </>
        ) : null}

        {state.kind === "error" ? (
          <CardContent>
            <p role="alert" className="text-sm text-destructive">
              Error: {state.message}
            </p>
          </CardContent>
        ) : null}

        {state.kind === "authorized" ? (
          <>
            <CardHeader>
              <CardTitle>Logged in as {state.data.userId}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Guild owner: {state.data.isGuildOwner ? "yes" : "no"}
              </p>
              <p className="text-sm text-muted-foreground">
                Capabilities: {state.data.capabilities}
              </p>
              <Button asChild>
                <Link href="/g">Select a server</Link>
              </Button>
            </CardContent>
          </>
        ) : null}
      </Card>
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
