import { parseDatabaseEnv } from "@sm-bot/config";
import { defineConfig } from "drizzle-kit";

const env = parseDatabaseEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: env.DATABASE_URL
  },
  strict: true,
  verbose: true
});
