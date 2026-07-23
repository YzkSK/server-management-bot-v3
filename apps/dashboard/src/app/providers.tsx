"use client";

import { isServer, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { useState, type ReactNode } from "react";

import { ThemeProvider } from "../components/theme-provider";
import { Toaster } from "../components/ui/sonner";
import { trpc } from "../trpc-client";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof TRPCClientError) {
            const code = error.data?.code;
            if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
              return false;
            }
          }

          return failureCount < 2;
        }
      }
    }
  });
}

// Browser-side singleton so React discarding a suspended first render
// doesn't recreate the QueryClient (and lose in-flight cache state).
let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }

  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function guildIdFromPathname(pathname: string): string | null {
  return pathname.match(/^\/g\/([^/]+)/)?.[1] ?? null;
}

// httpBatchLinkはProviders生成時(useState初回)に一度だけ作られるため、
// Reactのレンダー状態(props/state)をheaders()の中で参照することはできない。
// guildIdはURLそのものなので、Reactの再レンダーを介さず、リクエストが実際に
// 発火する瞬間にwindow.location.pathnameから直接読む。これにより、遷移直後や
// 中断されたレンダーが共有状態を汚してしまう競合状態を構造的に避けられる。
function currentGuildId(): string | null {
  if (typeof window === "undefined") return null;
  return guildIdFromPathname(window.location.pathname);
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          headers() {
            const guildId = currentGuildId();
            return guildId ? { "x-guild-id": guildId } : {};
          }
        })
      ]
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
