import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as zlib from "node:zlib";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { parseDatabaseEnv } from "@sm-bot/config";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";

import { createDbConnection, type DbConnection } from "../client.js";
import { insertLogEvent } from "../repositories/logs.js";
import { guilds, logs } from "../schema/index.js";
import { calculateArchiveCutoff, createArchiveFileName, resolveArchiveDir } from "./archive-logs.js";

const TEST_GUILD_ID = `archive-runner-${randomUUID()}`;
const LOCAL_DB_HOSTS = ["localhost", "127.0.0.1"];
const RUNNER_PATH = fileURLToPath(new URL("./archive-logs-runner.js", import.meta.url));

function assertLocalDatabase(databaseUrl: string): void {
  const hostname = new URL(databaseUrl).hostname;
  assert.ok(
    LOCAL_DB_HOSTS.includes(hostname),
    `DATABASE_URL must point at a local database (${LOCAL_DB_HOSTS.join(", ")}), got host "${hostname}"`
  );
}

// The real runner sweeps *every* guild's unarchived rows past the cutoff, not
// just this test's TEST_GUILD_ID. Actually invoking it against a dev DB that
// has unrelated old unarchived rows would mark them archived and then, when
// this test's afterEach wipes the temp archiveDir, permanently destroy the
// only copy of their archived content. Refuse to run rather than risk that.
// Uses a COUNT query (not selectLogEventsOlderThan's paginated rows) so it
// can't under-count past a page limit, and takes the same "now" the runner
// itself will use so the cutoffs can never disagree.
async function assertNoForeignArchivableRows(db: DbConnection["db"], now?: Date): Promise<void> {
  const cutoff = calculateArchiveCutoff(now);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(logs)
    .where(
      and(
        lt(logs.receivedAt, cutoff),
        isNull(logs.archivedAt),
        // guild_id != X is NULL (not true) for NULL guild_id rows in SQL, so
        // system-level rows (guildId null) must be treated as foreign too.
        or(isNull(logs.guildId), ne(logs.guildId, TEST_GUILD_ID))
      )
    );
  const foreignCount = row?.count ?? 0;
  assert.equal(
    foreignCount,
    0,
    `refusing to run archive-logs-runner integration test: found ${foreignCount} unarchived row(s) belonging to other guilds in this DB. Running the real runner would archive-and-mark them, and this test deletes its temp archive dir afterwards, permanently losing that data. Clean up the local dev DB before running this test.`
  );
}

async function runArchiveLogs(
  db: DbConnection["db"],
  archiveDir: string,
  now?: Date
): Promise<{ status: number; summary: unknown }> {
  // Re-checked immediately before every invocation (not just once in
  // beforeEach) since the runner reads live DB state at call time. Uses the
  // same "now" passed to this call so the guard's cutoff always matches
  // what the runner itself will compute.
  await assertNoForeignArchivableRows(db, now);

  try {
    const stdout = execFileSync(process.execPath, [RUNNER_PATH], {
      env: {
        ...process.env,
        ARCHIVE_DIR: archiveDir,
        ...(now ? { ARCHIVE_NOW: now.toISOString() } : {})
      },
      encoding: "utf8"
    });
    // Dotenv tooling prints an informational banner line to stdout ahead of
    // the runner's own JSON summary, and that banner can itself contain "{"
    // (e.g. "{ quiet: true }"), so locate our JSON.stringify(..., null, 2)
    // output by its own opening line rather than the first "{" anywhere.
    const lines = stdout.split("\n");
    const jsonStartLine = lines.findIndex((line) => line.trim() === "{");
    if (jsonStartLine === -1) {
      throw new Error(`archive-logs-runner produced no JSON summary on stdout: ${stdout}`);
    }
    return { status: 0, summary: JSON.parse(lines.slice(jsonStartLine).join("\n")) };
  } catch (err) {
    console.error("archive-logs-runner child process failed", err);
    const execErr = err as { status: number | null };
    return { status: execErr.status ?? 1, summary: null };
  }
}

describe("archive-logs-runner", () => {
  let connection: DbConnection;
  let archiveDir: string;

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
    archiveDir = await mkdtemp(join(tmpdir(), "archive-logs-runner-test-"));
  });

  afterEach(async () => {
    await rm(archiveDir, { recursive: true, force: true });
  });

  it("writes a valid JSON array gzip archive and marks archived rows, leaving them in the DB", async () => {
    const old = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date("2020-01-01T00:00:00.000Z"),
      receivedAt: new Date("2020-01-01T00:00:00.000Z"),
      payload: { note: "old" }
    });
    const recent = await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date(),
      receivedAt: new Date(),
      payload: { note: "recent" }
    });

    const { status, summary } = await runArchiveLogs(connection.db, archiveDir);
    assert.equal(status, 0);
    const outputPath = (summary as { outputPath: string }).outputPath;

    const decompressed = zlib.gunzipSync(fs.readFileSync(outputPath)).toString("utf8");
    const parsed = JSON.parse(decompressed) as Array<{ id: string; guildId: string }>;
    const ownRows = parsed.filter((row) => row.guildId === TEST_GUILD_ID);
    assert.deepEqual(
      ownRows.map((row) => row.id),
      [old.id]
    );

    const [oldRow] = await connection.db.select().from(logs).where(eq(logs.id, old.id));
    assert.ok(oldRow?.archivedAt instanceof Date);
    assert.ok(oldRow, "archived row must remain in the DB; deletion is retention's job");

    const [recentRow] = await connection.db.select().from(logs).where(eq(logs.id, recent.id));
    assert.equal(recentRow?.archivedAt, null);
  });

  it("does not re-archive rows already marked archived on a second run", async () => {
    await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date("2020-01-01T00:00:00.000Z"),
      receivedAt: new Date("2020-01-01T00:00:00.000Z"),
      payload: {}
    });

    // The archive filename has second-level precision, so pin each run's
    // "now" a second apart via ARCHIVE_NOW to deterministically avoid an
    // output-path collision between the two runs (a different scenario,
    // covered by the "refuses to overwrite" test below).
    const firstNow = new Date();
    const secondNow = new Date(firstNow.getTime() + 1000);

    const firstRun = await runArchiveLogs(connection.db, archiveDir, firstNow);
    assert.equal(firstRun.status, 0);
    assert.ok((firstRun.summary as { archivedCount: number }).archivedCount >= 1);

    const secondRun = await runArchiveLogs(connection.db, archiveDir, secondNow);
    assert.equal(secondRun.status, 0);
    assert.equal((secondRun.summary as { archivedCount: number }).archivedCount, 0);
  });

  it("refuses to overwrite an existing archive at the same output path", async () => {
    await insertLogEvent(connection.db, {
      eventName: "member.join",
      guildId: TEST_GUILD_ID,
      eventTimestamp: new Date("2020-01-01T00:00:00.000Z"),
      receivedAt: new Date("2020-01-01T00:00:00.000Z"),
      payload: {}
    });

    // Pin "now" via ARCHIVE_NOW so the path we pre-seed here is guaranteed
    // to be the exact path the runner computes, with no wall-clock second
    // boundary race between this line and the child process's own
    // `new Date()` call.
    const pinnedNow = new Date();
    const outputPath = join(
      resolveArchiveDir({ env: { ARCHIVE_DIR: archiveDir } }),
      createArchiveFileName(pinnedNow)
    );
    const placeholderContent = Buffer.from("not a real archive");
    fs.writeFileSync(outputPath, placeholderContent);

    const result = await runArchiveLogs(connection.db, archiveDir, pinnedNow);
    assert.notEqual(result.status, 0);

    const contentAfterCollision = fs.readFileSync(outputPath);
    assert.deepEqual(contentAfterCollision, placeholderContent);
  });

});
