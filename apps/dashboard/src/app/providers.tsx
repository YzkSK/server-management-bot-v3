"use client";

import { isServer, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { useState, type ReactNode } from "react";

import { currentGuildIdRef } from "../guild-context";
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

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          headers() {
            return currentGuildIdRef.current ? { "x-guild-id": currentGuildIdRef.current } : {};
          }
        })
      ]
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
