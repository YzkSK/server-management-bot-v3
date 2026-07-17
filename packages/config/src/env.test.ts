import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError } from "zod";

import {
  parseAppEnv,
  parseBotEnv,
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

  it("throws a ZodError when a required key is missing", () => {
    const { DISCORD_BOT_TOKEN: _omit, ...incomplete } = validEnv;
    assert.throws(() => parseAppEnv(incomplete), ZodError);
  });

  it("throws a ZodError for an invalid LOG_LEVEL", () => {
    assert.throws(
      () => parseAppEnv({ ...validEnv, LOG_LEVEL: "verbose" }),
      ZodError
    );
  });

  it("throws a ZodError when SESSION_ENCRYPTION_KEY is too short", () => {
    assert.throws(
      () => parseAppEnv({ ...validEnv, SESSION_ENCRYPTION_KEY: "short" }),
      ZodError
    );
  });
});

describe("parseDatabaseEnv", () => {
  it("only requires DATABASE_URL", () => {
    const result = parseDatabaseEnv({ DATABASE_URL: validEnv.DATABASE_URL });
    assert.equal(result.DATABASE_URL, validEnv.DATABASE_URL);
  });

  it("throws a ZodError when DATABASE_URL is missing", () => {
    assert.throws(() => parseDatabaseEnv({}), ZodError);
  });
});

describe("parseRedisEnv", () => {
  it("only requires REDIS_URL", () => {
    const result = parseRedisEnv({ REDIS_URL: validEnv.REDIS_URL });
    assert.equal(result.REDIS_URL, validEnv.REDIS_URL);
  });

  it("throws a ZodError when REDIS_URL is missing", () => {
    assert.throws(() => parseRedisEnv({}), ZodError);
  });
});

describe("parseBotEnv", () => {
  it("only requires DISCORD_BOT_TOKEN and DATABASE_URL, defaulting LOG_LEVEL", () => {
    const result = parseBotEnv({
      DISCORD_BOT_TOKEN: validEnv.DISCORD_BOT_TOKEN,
      DATABASE_URL: validEnv.DATABASE_URL
    });
    assert.equal(result.DISCORD_BOT_TOKEN, validEnv.DISCORD_BOT_TOKEN);
    assert.equal(result.DATABASE_URL, validEnv.DATABASE_URL);
    assert.equal(result.LOG_LEVEL, "info");
  });

  it("throws a ZodError when DISCORD_BOT_TOKEN is missing", () => {
    assert.throws(
      () => parseBotEnv({ DATABASE_URL: validEnv.DATABASE_URL }),
      ZodError
    );
  });

  it("throws a ZodError when DATABASE_URL is missing", () => {
    assert.throws(
      () => parseBotEnv({ DISCORD_BOT_TOKEN: validEnv.DISCORD_BOT_TOKEN }),
      ZodError
    );
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
    assert.equal(result.DISCORD_CLIENT_ID, "");
  });

  it("throws a ZodError when DISCORD_CLIENT_SECRET is missing", () => {
    assert.throws(
      () => parseDashboardAuthEnv({ NEXTAUTH_SECRET: validEnv.NEXTAUTH_SECRET }),
      ZodError
    );
  });
});
