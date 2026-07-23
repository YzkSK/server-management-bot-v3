import { router } from "@sm-bot/dashboard-access";
import { createLogsRouter } from "@sm-bot/logging";

import { dashboardAccessRouter } from "./dashboard-access-router";
import { getDashboardDb } from "./trpc-context";

export const appRouter = router({
  dashboardAccess: dashboardAccessRouter,
  logs: createLogsRouter({ getDb: getDashboardDb })
});

export type AppRouter = typeof appRouter;
