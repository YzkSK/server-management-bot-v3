import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

import { appRouter } from "../../../../server/app-router";
import { createContext } from "../../../../server/trpc-context";

function handler(req: NextRequest) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req)
  });
}

export { handler as GET, handler as POST };
