import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { parseDatabaseEnv } from "@sm-bot/config";
import { eq, inArray } from "drizzle-orm";

import { createDbConnection, type DbConnection } from "../client.js";
import { getGuildLogMode, setGuildLogMode } from "../repositories/guild-configs.js";
import { guildConfigs, guilds } from "./index.js";

const TEST_GUILD_ID = `guild-configs-schema-${randomUUID()}`;
const OTHER_TEST_GUILD_ID = `guild-configs-schema-other-${randomUUID()}`;
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

describe("guild_configs schema constraints", () => {
  let connection: DbConnection;

  before(() => {
    const databaseUrl = parseDatabaseEnv().DATABASE_URL;
    assertLocalDatabase(databaseUrl);
    connection = createDbConnection(databaseUrl);
  });

  after(async () => {
    await connection.db
      .delete(guildConfigs)
      .where(inArray(guildConfigs.guildId, [TEST_GUILD_ID, OTHER_TEST_GUILD_ID]));
    await connection.db
      .delete(guilds)
      .where(inArray(guilds.guildId, [TEST_GUILD_ID, OTHER_TEST_GUILD_ID]));
    await connection.close();
  });

  beforeEach(async () => {
    await connection.db
      .delete(guildConfigs)
      .where(inArray(guildConfigs.guildId, [TEST_GUILD_ID, OTHER_TEST_GUILD_ID]));
    await connection.db
      .delete(guilds)
      .where(inArray(guilds.guildId, [TEST_GUILD_ID, OTHER_TEST_GUILD_ID]));
    await connection.db
      .insert(guilds)
      .values([{ guildId: TEST_GUILD_ID }, { guildId: OTHER_TEST_GUILD_ID }]);
  });

  it("defaults logMode to full when no value is provided", async () => {
    const [config] = await connection.db
      .insert(guildConfigs)
      .values({ guildId: TEST_GUILD_ID })
      .returning();

    assert.equal(config?.logMode, "full");
  });

  it("rejects a logMode outside ('full', 'metadata_only', 'disabled') via the CHECK constraint", async () => {
    await assert.rejects(
      connection.db.insert(guildConfigs).values({
        guildId: TEST_GUILD_ID,
        // CastはDB側CHECK制約を検証するため、GuildLogMode型を意図的にバイパスする。
        logMode: "verbose" as unknown as "full" | "metadata_only" | "disabled"
      }),
      (rawError: unknown) => {
        const error = unwrapPostgresError(rawError);
        assert.ok(isPostgresError(error));
        assert.equal(error.code, "23514");
        assert.equal(error.constraint_name, "guild_configs_log_mode_check");
        return true;
      }
    );
  });

  it("rejects a guildId that has no matching guilds row via the FK constraint", async () => {
    await assert.rejects(
      connection.db.insert(guildConfigs).values({
        guildId: `nonexistent-${randomUUID()}`,
        logMode: "full"
      }),
      (rawError: unknown) => {
        const error = unwrapPostgresError(rawError);
        assert.ok(isPostgresError(error));
        assert.equal(error.code, "23503");
        return true;
      }
    );
  });

  it("rejects a duplicate guildId via the unique index", async () => {
    await connection.db.insert(guildConfigs).values({ guildId: TEST_GUILD_ID });

    await assert.rejects(
      connection.db.insert(guildConfigs).values({ guildId: TEST_GUILD_ID }),
      (rawError: unknown) => {
        const error = unwrapPostgresError(rawError);
        assert.ok(isPostgresError(error));
        assert.equal(error.code, "23505");
        assert.equal(error.constraint_name, "guild_configs_guild_id_idx");
        return true;
      }
    );
  });

  it("cascades guild_configs deletion when the parent guild is deleted", async () => {
    await connection.db.insert(guildConfigs).values({ guildId: TEST_GUILD_ID });

    await connection.db.delete(guilds).where(eq(guilds.guildId, TEST_GUILD_ID));

    const remaining = await connection.db
      .select()
      .from(guildConfigs)
      .where(eq(guildConfigs.guildId, TEST_GUILD_ID));

    assert.deepEqual(remaining, []);
  });

  it("getGuildLogMode / setGuildLogMode round-trip through the real database", async () => {
    assert.equal(await getGuildLogMode(connection.db, TEST_GUILD_ID), "full");

    await setGuildLogMode(connection.db, TEST_GUILD_ID, "metadata_only");
    assert.equal(await getGuildLogMode(connection.db, TEST_GUILD_ID), "metadata_only");

    await setGuildLogMode(connection.db, TEST_GUILD_ID, "disabled");
    assert.equal(await getGuildLogMode(connection.db, TEST_GUILD_ID), "disabled");
  });

  it("scopes getGuildLogMode to the requested guild and does not leak another guild's config", async () => {
    await setGuildLogMode(connection.db, TEST_GUILD_ID, "metadata_only");
    await setGuildLogMode(connection.db, OTHER_TEST_GUILD_ID, "disabled");

    assert.equal(await getGuildLogMode(connection.db, TEST_GUILD_ID), "metadata_only");
    assert.equal(await getGuildLogMode(connection.db, OTHER_TEST_GUILD_ID), "disabled");
  });
});
