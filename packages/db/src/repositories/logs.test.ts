import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { parseDatabaseEnv } from "@sm-bot/config";
import { eq } from "drizzle-orm";

import { createDbConnection, type DbConnection } from "../client.js";
import { guilds, logs } from "../schema/index.js";
import { upsertGuild } from "./guilds.js";
import {
  getUnsyncedLogEvents,
  insertLogEvent,
  markLogEventStreamSynced
} from "./logs.js";

const TEST_GUILD_ID = `logs-repo-${randomUUID()}`;
const LOCAL_DB_HOSTS = ["localhost", "127.0.0.1"];

function assertLocalDatabase(databaseUrl: string): void {
  const hostname = new URL(databaseUrl).hostname;
  assert.ok(
    LOCAL_DB_HOSTS.includes(hostname),
    `DATABASE_URL must point at a local database (${LOCAL_DB_HOSTS.join(", ")}), got host "${hostname}"`
  );
}

describe("markLogEventStreamSynced / getUnsyncedLogEvents", () => {
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

  it("insertLogEvent leaves streamSyncedAt null by default", async () => {
    const inserted = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(),
      payload: {}
    });

    assert.equal(inserted.streamSyncedAt, null);
  });

  it("markLogEventStreamSynced sets streamSyncedAt to the current time", async () => {
    const inserted = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(),
      payload: {}
    });

    await markLogEventStreamSynced(connection.db, inserted.id);

    const [row] = await connection.db
      .select()
      .from(logs)
      .where(eq(logs.id, inserted.id));
    assert.ok(row?.streamSyncedAt instanceof Date);
  });

  it("getUnsyncedLogEvents excludes rows already synced", async () => {
    const synced = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(0),
      receivedAt: new Date(0),
      payload: {}
    });
    await markLogEventStreamSynced(connection.db, synced.id);
    const unsynced = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(0),
      receivedAt: new Date(0),
      payload: {}
    });

    const result = await getUnsyncedLogEvents(connection.db, {
      limit: 10,
      olderThanMs: 0
    });

    const ids = result.map((row) => row.id);
    assert.ok(ids.includes(unsynced.id));
    assert.ok(!ids.includes(synced.id));
  });

  it("getUnsyncedLogEvents excludes rows newer than the grace period", async () => {
    await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(),
      receivedAt: new Date(),
      payload: {}
    });

    const result = await getUnsyncedLogEvents(connection.db, {
      limit: 10,
      olderThanMs: 60 * 60 * 1000
    });

    assert.deepEqual(
      result.filter((row) => row.guildId === TEST_GUILD_ID),
      []
    );
  });

  it("getUnsyncedLogEvents orders by receivedAt ascending and respects limit", async () => {
    const older = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(0),
      receivedAt: new Date("0002-01-01T00:00:00.000Z"),
      payload: {}
    });
    const newer = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(0),
      receivedAt: new Date("0003-01-01T00:00:00.000Z"),
      payload: {}
    });

    const result = await getUnsyncedLogEvents(connection.db, {
      limit: 100,
      olderThanMs: 0
    });

    const ownRows = result.filter((row) => row.guildId === TEST_GUILD_ID);
    assert.deepEqual(
      ownRows.map((row) => row.id),
      [older.id, newer.id]
    );

    // receivedAt is set to an implausibly old date so this row is virtually
    // guaranteed to be the single oldest unsynced row in the whole (shared,
    // non-guild-scoped) table, keeping the limit assertion below
    // deterministic even with unrelated pre-existing rows in the dev DB.
    const third = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(0),
      receivedAt: new Date("0001-01-01T00:00:00.000Z"),
      payload: {}
    });

    const limited = await getUnsyncedLogEvents(connection.db, {
      limit: 1,
      olderThanMs: 0
    });

    const limitedOwnRows = limited.filter((row) => row.guildId === TEST_GUILD_ID);
    assert.deepEqual(
      limitedOwnRows.map((row) => row.id),
      [third.id]
    );
  });
});
