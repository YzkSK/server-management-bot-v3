import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseAppEnv,
  parseDashboardAuthEnv,
  parseDatabaseEnv,
  parseRedisEnv
} from "./env.js";

const validEnv = {
  DISCORD_BOT_TOKEN: "token",
  DISCORD_CLIENT_ID: "client-id",
  DISCORD_CLIENT_SECRET: "client-secret",
  DISCORD_REDIRECT_URI: "http://localhost:3000/api/auth/callback/discord",
  DATABASE_URL: "postgres://sm_bot:sm_bot@localhost:5432/sm_bot",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_SECRET: "secret",
  SESSION_ENCRYPTION_KEY: "x".repeat(32),
  PUBLIC_DASHBOARD_URL: "http://localhost:3000"
};

describe("parseAppEnv", () => {
  it("parses a valid environment and defaults LOG_LEVEL to info", () => {
    const result = parseAppEnv(validEnv);
    assert.equal(result.LOG_LEVEL, "info");
    assert.equal(result.DATABASE_URL, validEnv.DATABASE_URL);
  });

  it("throws when a required key is missing", () => {
    const { DISCORD_BOT_TOKEN: _omit, ...incomplete } = validEnv;
    assert.throws(() => parseAppEnv(incomplete));
  });
});

describe("parseDatabaseEnv", () => {
  it("only requires DATABASE_URL", () => {
    const result = parseDatabaseEnv({ DATABASE_URL: validEnv.DATABASE_URL });
    assert.equal(result.DATABASE_URL, validEnv.DATABASE_URL);
  });
});

describe("parseRedisEnv", () => {
  it("only requires REDIS_URL", () => {
    const result = parseRedisEnv({ REDIS_URL: validEnv.REDIS_URL });
    assert.equal(result.REDIS_URL, validEnv.REDIS_URL);
  });
});

describe("parseDashboardAuthEnv", () => {
  it("requires DISCORD_CLIENT_SECRET and NEXTAUTH_SECRET only", () => {
    const result = parseDashboardAuthEnv({
      DISCORD_CLIENT_SECRET: validEnv.DISCORD_CLIENT_SECRET,
      NEXTAUTH_SECRET: validEnv.NEXTAUTH_SECRET
    });
    assert.equal(result.DISCORD_CLIENT_SECRET, validEnv.DISCORD_CLIENT_SECRET);
    assert.equal(result.NEXTAUTH_SECRET, validEnv.NEXTAUTH_SECRET);
  });
});
