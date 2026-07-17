import { router } from "@sm-bot/dashboard-access";

import { dashboardAccessRouter } from "./dashboard-access-router";

export const appRouter = router({
  dashboardAccess: dashboardAccessRouter
});

export type AppRouter = typeof appRouter;
