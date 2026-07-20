import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { parseDatabaseEnv } from "@sm-bot/config";
import { eq } from "drizzle-orm";

import { createDbConnection, type DbConnection } from "../client.js";
import { upsertGuild } from "../repositories/guilds.js";
import { guilds } from "./index.js";

const TEST_GUILD_ID = `guilds-schema-${randomUUID()}`;
const LOCAL_DB_HOSTS = ["localhost", "127.0.0.1"];

function assertLocalDatabase(databaseUrl: string): void {
  const hostname = new URL(databaseUrl).hostname;
  assert.ok(
    LOCAL_DB_HOSTS.includes(hostname),
    `DATABASE_URL must point at a local database (${LOCAL_DB_HOSTS.join(", ")}), got host "${hostname}"`
  );
}

describe("upsertGuild via the real database", () => {
  let connection: DbConnection;

  before(() => {
    const databaseUrl = parseDatabaseEnv().DATABASE_URL;
    assertLocalDatabase(databaseUrl);
    connection = createDbConnection(databaseUrl);
  });

  after(async () => {
    await connection.db.delete(guilds).where(eq(guilds.guildId, TEST_GUILD_ID));
    await connection.close();
  });

  beforeEach(async () => {
    await connection.db.delete(guilds).where(eq(guilds.guildId, TEST_GUILD_ID));
  });

  it("creates exactly one guild row when none exists", async () => {
    await upsertGuild(connection.db, TEST_GUILD_ID);

    const rows = await connection.db
      .select()
      .from(guilds)
      .where(eq(guilds.guildId, TEST_GUILD_ID));

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.isActive, true);
  });

  it("reactivates an existing row instead of creating a duplicate", async () => {
    await connection.db.insert(guilds).values({ guildId: TEST_GUILD_ID, isActive: false });

    await upsertGuild(connection.db, TEST_GUILD_ID);

    const rows = await connection.db
      .select()
      .from(guilds)
      .where(eq(guilds.guildId, TEST_GUILD_ID));

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.isActive, true);
  });
});
