import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { parseDatabaseEnv } from "@sm-bot/config";
import { eq } from "drizzle-orm";

import { createDbConnection, type DbConnection } from "../client.js";
import { listGrantsForPrincipal } from "../repositories/dashboard-access.js";
import { dashboardAccessGrants, guilds } from "./index.js";

const TEST_GUILD_ID = `schema-regression-${randomUUID()}`;
const LOCAL_DB_HOSTS = ["localhost", "127.0.0.1"];

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

// This suite deletes/inserts rows against whatever DATABASE_URL points at, so
// refuse to run against anything that isn't the local dev/CI Postgres.
function assertLocalDatabase(databaseUrl: string): void {
  const hostname = new URL(databaseUrl).hostname;
  assert.ok(
    LOCAL_DB_HOSTS.includes(hostname),
    `DATABASE_URL must point at a local database (${LOCAL_DB_HOSTS.join(", ")}), got host "${hostname}"`
  );
}

describe("dashboard_access_grants schema constraints", () => {
  let connection: DbConnection;

  before(() => {
    const databaseUrl = parseDatabaseEnv().DATABASE_URL;
    assertLocalDatabase(databaseUrl);
    connection = createDbConnection(databaseUrl);
  });

  after(async () => {
    await connection.db
      .delete(dashboardAccessGrants)
      .where(eq(dashboardAccessGrants.guildId, TEST_GUILD_ID));
    await connection.db.delete(guilds).where(eq(guilds.guildId, TEST_GUILD_ID));
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

  it("advances updatedAt when a grant is updated through Drizzle", async () => {
    const [created] = await connection.db
      .insert(dashboardAccessGrants)
      .values({
        guildId: TEST_GUILD_ID,
        targetType: "user",
        targetId: "user-updated-at",
        capabilities: 0n
      })
      .returning();
    assert.ok(created);

    const [updated] = await connection.db
      .update(dashboardAccessGrants)
      .set({ capabilities: 1n })
      .where(eq(dashboardAccessGrants.id, created.id))
      .returning();
    assert.ok(updated);

    assert.ok(updated.updatedAt.getTime() > created.updatedAt.getTime());
  });

  it("listGrantsForPrincipal returns only the user grant when roleIds is empty", async () => {
    await connection.db.insert(dashboardAccessGrants).values([
      {
        guildId: TEST_GUILD_ID,
        targetType: "user",
        targetId: "user-1",
        capabilities: 1n
      },
      {
        guildId: TEST_GUILD_ID,
        targetType: "role",
        targetId: "role-everyone",
        capabilities: 2n
      }
    ]);

    const rows = await listGrantsForPrincipal(connection.db, {
      guildId: TEST_GUILD_ID,
      userId: "user-1",
      roleIds: []
    });

    assert.deepEqual(
      rows.map((row) => row.targetId),
      ["user-1"]
    );
  });

  it("listGrantsForPrincipal returns rows ordered by targetType then targetId", async () => {
    await connection.db.insert(dashboardAccessGrants).values([
      {
        guildId: TEST_GUILD_ID,
        targetType: "role",
        targetId: "role-z",
        capabilities: 1n
      },
      {
        guildId: TEST_GUILD_ID,
        targetType: "user",
        targetId: "user-1",
        capabilities: 2n
      },
      {
        guildId: TEST_GUILD_ID,
        targetType: "role",
        targetId: "role-a",
        capabilities: 4n
      }
    ]);

    const rows = await listGrantsForPrincipal(connection.db, {
      guildId: TEST_GUILD_ID,
      userId: "user-1",
      roleIds: ["role-z", "role-a"]
    });

    assert.deepEqual(
      rows.map((row) => [row.targetType, row.targetId]),
      [
        ["role", "role-a"],
        ["role", "role-z"],
        ["user", "user-1"]
      ]
    );
  });
});
