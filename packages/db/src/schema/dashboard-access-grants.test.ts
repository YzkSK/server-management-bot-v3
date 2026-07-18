import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { parseDatabaseEnv } from "@sm-bot/config";
import { eq } from "drizzle-orm";

import { createDbConnection, type DbConnection } from "../client.js";
import { dashboardAccessGrants, guilds } from "./index.js";

const TEST_GUILD_ID = "schema-regression-guild";

interface PostgresError {
  code?: string;
  constraint_name?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return typeof error === "object" && error !== null && "code" in error;
}

// drizzle-orm wraps the driver error in a DrizzleQueryError; the raw PostgresError
// (with `code`/`constraint_name`) lives on its `cause`.
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

describe("dashboard_access_grants schema constraints", () => {
  let connection: DbConnection;

  before(() => {
    connection = createDbConnection(parseDatabaseEnv().DATABASE_URL);
  });

  after(async () => {
    await connection.close();
  });

  beforeEach(async () => {
    await connection.db
      .delete(dashboardAccessGrants)
      .where(eq(dashboardAccessGrants.guildId, TEST_GUILD_ID));
    await connection.db.delete(guilds).where(eq(guilds.guildId, TEST_GUILD_ID));
    await connection.db.insert(guilds).values({ guildId: TEST_GUILD_ID });
  });

  it("rejects a duplicate (guildId, targetType, targetId) grant via the unique index", async () => {
    await connection.db.insert(dashboardAccessGrants).values({
      guildId: TEST_GUILD_ID,
      targetType: "role",
      targetId: "role-1",
      capabilities: 0n
    });

    await assert.rejects(
      connection.db.insert(dashboardAccessGrants).values({
        guildId: TEST_GUILD_ID,
        targetType: "role",
        targetId: "role-1",
        capabilities: 1n
      }),
      (rawError: unknown) => {
        const error = unwrapPostgresError(rawError);
        assert.ok(isPostgresError(error));
        assert.equal(error.code, "23505");
        assert.equal(
          error.constraint_name,
          "dashboard_access_grants_target_idx"
        );
        return true;
      }
    );
  });

  it("rejects a targetType outside ('user', 'role') via the CHECK constraint", async () => {
    await assert.rejects(
      connection.db.insert(dashboardAccessGrants).values({
        guildId: TEST_GUILD_ID,
        // Cast bypasses the "user" | "role" union to exercise the DB-level CHECK constraint.
        targetType: "channel" as unknown as "user" | "role",
        targetId: "channel-1",
        capabilities: 0n
      }),
      (rawError: unknown) => {
        const error = unwrapPostgresError(rawError);
        assert.ok(isPostgresError(error));
        assert.equal(error.code, "23514");
        assert.equal(
          error.constraint_name,
          "dashboard_access_grants_target_type_check"
        );
        return true;
      }
    );
  });

  it("onConflictDoNothing silently skips a duplicate grant instead of throwing", async () => {
    await connection.db.insert(dashboardAccessGrants).values({
      guildId: TEST_GUILD_ID,
      targetType: "user",
      targetId: "user-1",
      capabilities: 0n
    });

    const inserted = await connection.db
      .insert(dashboardAccessGrants)
      .values({
        guildId: TEST_GUILD_ID,
        targetType: "user",
        targetId: "user-1",
        capabilities: 5n
      })
      .onConflictDoNothing({
        target: [
          dashboardAccessGrants.guildId,
          dashboardAccessGrants.targetType,
          dashboardAccessGrants.targetId
        ]
      })
      .returning({ id: dashboardAccessGrants.id });

    assert.equal(inserted.length, 0);
  });
});
