import { router } from "@sm-bot/dashboard-access";
import { createGuildSettingsRouter } from "@sm-bot/guild-settings";
import { createLogsRouter } from "@sm-bot/logging";

import { dashboardAccessRouter } from "./dashboard-access-router";
import { getDashboardDb } from "./trpc-context";

export const appRouter = router({
  dashboardAccess: dashboardAccessRouter,
  guildSettings: createGuildSettingsRouter({ getDb: getDashboardDb }),
  logs: createLogsRouter({ getDb: getDashboardDb })
});

export type AppRouter = typeof appRouter;
