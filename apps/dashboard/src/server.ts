import { createServer } from "node:http";

import { parseDashboardAuthEnv } from "@sm-bot/config";
import next from "next";

import { attachRealtimeServer } from "./realtime/attach-realtime-server.ts";
import { getDashboardDb, getDashboardRedisClient } from "./server/trpc-context.ts";

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const env = parseDashboardAuthEnv();

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    void handle(req, res);
  });

  attachRealtimeServer(httpServer, {
    nextAuthSecret: env.NEXTAUTH_SECRET,
    botToken: env.DISCORD_BOT_TOKEN,
    getDb: getDashboardDb,
    getRedisClient: getDashboardRedisClient,
    getCacheClient: getDashboardRedisClient
  });

  httpServer.listen(port, () => {
    console.log(`> dashboard listening on http://localhost:${port} (${dev ? "development" : "production"})`);
  });
}).catch((error: unknown) => {
  console.error("dashboard: failed to start server", error);
  process.exit(1);
});
