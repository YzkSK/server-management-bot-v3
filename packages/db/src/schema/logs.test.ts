import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { parseDatabaseEnv } from "@sm-bot/config";
import { eq } from "drizzle-orm";

import { createDbConnection, type DbConnection } from "../client.js";
import { upsertGuild } from "../repositories/guilds.js";
import { insertLogEvent } from "../repositories/logs.js";
import { guilds, logs } from "./index.js";

const TEST_GUILD_ID = `logs-schema-${randomUUID()}`;
const LOCAL_DB_HOSTS = ["localhost", "127.0.0.1"];

interface PostgresError {
  code?: string;
  constraint_name?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return typeof error === "object" && error !== null && "code" in error;
}

function unwrapPostgresError(error: unknown): unknown {
  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    isPostgresError((error as { cause: unknown }).cause)
  ) {
    return (error as { cause: unknown }).cause;
  }
  return error;
}

function assertLocalDatabase(databaseUrl: string): void {
  const hostname = new URL(databaseUrl).hostname;
  assert.ok(
    LOCAL_DB_HOSTS.includes(hostname),
    `DATABASE_URL must point at a local database (${LOCAL_DB_HOSTS.join(", ")}), got host "${hostname}"`
  );
}

describe("logs schema constraints", () => {
  let connection: DbConnection;

  before(() => {
    const databaseUrl = parseDatabaseEnv().DATABASE_URL;
    assertLocalDatabase(databaseUrl);
    connection = createDbConnection(databaseUrl);
  });

  after(async () => {
    await connection.db.delete(logs).where(eq(logs.guildId, TEST_GUILD_ID));
    await connection.db.delete(guilds).where(eq(guilds.guildId, TEST_GUILD_ID));
    await connection.close();
  });

  beforeEach(async () => {
    await connection.db.delete(logs).where(eq(logs.guildId, TEST_GUILD_ID));
    await connection.db.delete(guilds).where(eq(guilds.guildId, TEST_GUILD_ID));
    await connection.db.insert(guilds).values({ guildId: TEST_GUILD_ID });
  });

  it("insertLogEvent inserts a row with repository defaults applied to optional fields", async () => {
    const eventTimestamp = new Date("2026-07-18T00:00:00.000Z");

    const inserted = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      actorId: "user-1",
      eventTimestamp,
      payload: { displayName: "test" }
    });

    assert.equal(inserted.eventName, "member.join");
    assert.equal(inserted.guildId, TEST_GUILD_ID);
    assert.equal(inserted.channelId, null);
    assert.equal(inserted.messageId, null);
    assert.equal(inserted.realtimeEnabled, false);
    assert.deepEqual(inserted.payload, { displayName: "test" });
    assert.equal(inserted.eventTimestamp.getTime(), eventTimestamp.getTime());
  });

  it("insertLogEvent allows guildId to be null for system-level events", async () => {
    const inserted = await insertLogEvent(connection.db, {
      eventName: "system.bot.started",
      guildId: null,
      eventTimestamp: new Date(),
      payload: {}
    });

    assert.equal(inserted.guildId, null);
    await connection.db.delete(logs).where(eq(logs.id, inserted.id));
  });

  it("rejects a guildId that has no matching guilds row via the FK constraint", async () => {
    await assert.rejects(
      insertLogEvent(connection.db, {
        eventName: "member.join",
        guildId: `nonexistent-${randomUUID()}`,
        eventTimestamp: new Date(),
        payload: {}
      }),
      (rawError: unknown) => {
        const error = unwrapPostgresError(rawError);
        assert.ok(isPostgresError(error));
        assert.equal(error.code, "23503");
        return true;
      }
    );
  });

  it("succeeds on retry after upsertGuild recovers a missing guild row (issue #102 FK race)", async (t) => {
    const raceGuildId = `logs-schema-race-${randomUUID()}`;
    t.after(async () => {
      await connection.db.delete(logs).where(eq(logs.guildId, raceGuildId));
      await connection.db.delete(guilds).where(eq(guilds.guildId, raceGuildId));
    });
    await connection.db.delete(guilds).where(eq(guilds.guildId, raceGuildId));

    await assert.rejects(
      insertLogEvent(connection.db, {
        eventName: "member.join",
        guildId: raceGuildId,
        eventTimestamp: new Date(),
        payload: {}
      }),
      (rawError: unknown) => {
        const error = unwrapPostgresError(rawError);
        assert.ok(isPostgresError(error));
        assert.equal(error.code, "23503");
        return true;
      }
    );

    await upsertGuild(connection.db, raceGuildId);

    const inserted = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: raceGuildId,
      eventTimestamp: new Date(),
      payload: {}
    });

    assert.equal(inserted.guildId, raceGuildId);
  });

  it("cascades log deletion when the parent guild is deleted", async () => {
    await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(),
      payload: {}
    });

    await connection.db.delete(guilds).where(eq(guilds.guildId, TEST_GUILD_ID));

    const remaining = await connection.db
      .select()
      .from(logs)
      .where(eq(logs.guildId, TEST_GUILD_ID));

    assert.deepEqual(remaining, []);
  });
});
