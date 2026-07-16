import { parseDatabaseEnv } from "@sm-bot/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

const DB_POOL_MAX = 10;
const DB_CLOSE_TIMEOUT_SEC = 5;

export function createDbConnection(
  databaseUrl = parseDatabaseEnv().DATABASE_URL
) {
  const client = postgres(databaseUrl, {
    max: DB_POOL_MAX,
    prepare: false
  });

  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: DB_CLOSE_TIMEOUT_SEC })
  };
}

export type DbConnection = ReturnType<typeof createDbConnection>;
export type DbClient = DbConnection["db"];
