import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as zlib from "node:zlib";
import { after, before, beforeEach, describe, it } from "node:test";

import { parseDatabaseEnv } from "@sm-bot/config";
import { eq } from "drizzle-orm";

import { createDbConnection, type DbConnection } from "../client.js";
import { insertLogEvent } from "../repositories/logs.js";
import { guilds, logs } from "../schema/index.js";
import { createArchiveFileName, resolveArchiveDir } from "./archive-logs.js";

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

// The real runner sweeps *every* guild's unarchived rows past the cutoff,
// not just this test's TEST_GUILD_ID — CI runs every package's test suite
// concurrently against one shared local Postgres (turbo has no dependency
// edge between sibling "test" tasks, and node:test itself runs multiple
// files in parallel), so unrelated fixture rows from other tests can
// legitimately get swept up here. That's fine: archived output files are
// deliberately never deleted by this suite (see below), so no archive
// content is ever lost even if a concurrent test's rows get included.
// Assertions below only inspect this suite's own TEST_GUILD_ID rows.
async function runArchiveLogs(
  archiveDir: string,
  now?: Date
): Promise<{ status: number; summary: unknown }> {
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
    // Deliberately never deleted: this suite runs concurrently with other
    // tests/packages against the same shared DB, so the runner may sweep in
    // unrelated rows too. Leaving the temp archive on disk (OS/CI cleans it
    // up eventually) guarantees nothing archived is ever actually lost.
    archiveDir = await mkdtemp(join(tmpdir(), "archive-logs-runner-test-"));
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

    const { status, summary } = await runArchiveLogs(archiveDir);
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
    const target = await insertLogEvent(connection.db, {
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

    const firstRun = await runArchiveLogs(archiveDir, firstNow);
    assert.equal(firstRun.status, 0);
    assert.ok((firstRun.summary as { archivedCount: number }).archivedCount >= 1);

    const secondRun = await runArchiveLogs(archiveDir, secondNow);
    assert.equal(secondRun.status, 0);

    // Don't assert a global archivedCount of exactly 0: other tests/packages
    // share this DB concurrently and may legitimately have their own
    // archivable rows swept in. Only assert that *this* row specifically
    // isn't archived again.
    const secondOutputPath = (secondRun.summary as { outputPath: string }).outputPath;
    const decompressed = zlib.gunzipSync(fs.readFileSync(secondOutputPath)).toString("utf8");
    const parsed = JSON.parse(decompressed) as Array<{ id: string }>;
    assert.ok(
      !parsed.some((row) => row.id === target.id),
      "row already archived in the first run must not appear in the second run's archive"
    );
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

    const result = await runArchiveLogs(archiveDir, pinnedNow);
    assert.notEqual(result.status, 0);

    const contentAfterCollision = fs.readFileSync(outputPath);
    assert.deepEqual(contentAfterCollision, placeholderContent);
  });

});
