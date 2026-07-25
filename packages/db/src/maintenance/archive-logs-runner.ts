import { randomUUID } from "node:crypto";
import { once } from "node:events";
import * as fs from "node:fs";
import { link, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";

import { createDbConnection } from "../client.js";
import {
  markLogEventsArchived,
  selectLogEventsOlderThan
} from "../repositories/logs.js";
import {
  ARCHIVE_LOCK_KEY,
  calculateArchiveCutoff,
  createArchiveFileName,
  resolveArchiveDir,
  resolveNow,
  toArchiveSummary
} from "./archive-logs.js";

const BATCH_SIZE = 1000;

// IDs to archive are appended to this on-disk manifest as they stream past,
// instead of accumulating in memory, so a large backlog can't OOM the job.
// It's only read back (in batches) to mark rows after the archive file is
// durably published, preserving the "never mark before publish" guarantee.
async function markArchivedFromManifest(
  db: Awaited<ReturnType<typeof createDbConnection>>["db"],
  manifestPath: string
): Promise<void> {
  const rl = createInterface({
    input: fs.createReadStream(manifestPath),
    crlfDelay: Infinity
  });

  let batch: string[] = [];
  for await (const line of rl) {
    if (!line) continue;
    batch.push(line);
    if (batch.length >= BATCH_SIZE) {
      await markLogEventsArchived(db, batch);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await markLogEventsArchived(db, batch);
  }
}

async function main() {
  const archiveDir = resolveArchiveDir();
  const now = resolveNow();
  const archiveBefore = calculateArchiveCutoff(now);
  const outputPath = join(archiveDir, createArchiveFileName(now));
  const tempPath = `${outputPath}.${randomUUID()}.part`;
  const manifestPath = `${tempPath}.ids`;
  const { client, db, close } = createDbConnection();

  // Session-scoped lock held on a dedicated reserved connection for the
  // whole run, so a second concurrent `logs:archive` invocation can't select
  // and publish the same rows before this run marks them archived.
  const lockSession = await client.reserve();

  try {
    const [lockRow] = await lockSession<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${ARCHIVE_LOCK_KEY}) AS locked
    `;
    if (!lockRow?.locked) {
      console.log("archive-logs: another run is already in progress, skipping");
      return;
    }

    await mkdir(archiveDir, { recursive: true });

    // Written to a temp path and gzip/file completion is awaited via
    // pipeline() before the atomic link-publish below, so a crash mid-write
    // never leaves a broken archive at the final path.
    const gzip = zlib.createGzip();
    const outputStream = fs.createWriteStream(tempPath, { flags: "wx" });
    const written = pipeline(gzip, outputStream);

    const manifestStream = fs.createWriteStream(manifestPath, { flags: "wx" });

    let cursor: { receivedAt: Date; id: string } | undefined;
    let archivedCount = 0;
    let isFirstRow = true;

    if (!gzip.write("[")) {
      await once(gzip, "drain");
    }

    while (true) {
      const batch = await selectLogEventsOlderThan(db, {
        cutoff: archiveBefore,
        limit: BATCH_SIZE,
        ...(cursor ? { after: cursor } : {})
      });

      if (batch.length === 0) break;

      for (const row of batch) {
        const chunk = `${isFirstRow ? "" : ","}${JSON.stringify(row)}`;
        isFirstRow = false;
        if (!gzip.write(chunk)) {
          await once(gzip, "drain");
        }
        if (!manifestStream.write(`${row.id}\n`)) {
          await once(manifestStream, "drain");
        }
        archivedCount++;
      }

      const last = batch[batch.length - 1];
      if (!last) break;
      cursor = { receivedAt: last.receivedAt, id: last.id };

      if (batch.length < BATCH_SIZE) break;
    }

    gzip.end("]");
    manifestStream.end();
    await Promise.all([written, once(manifestStream, "finish")]);

    // link() atomically fails with EEXIST if outputPath already exists,
    // unlike rename() which would silently replace it — so a same-second
    // collision fails loudly instead of destroying a prior archive.
    await link(tempPath, outputPath);
    await rm(tempPath, { force: true });

    // Only rows confirmed written to the renamed archive are marked, so
    // log-retention (which only deletes archivedAt IS NOT NULL rows) never
    // deletes data that isn't durably archived yet.
    await markArchivedFromManifest(db, manifestPath);
    await rm(manifestPath, { force: true });

    const summary = toArchiveSummary({
      archiveBefore,
      archivedCount,
      outputPath
    });

    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error("archive-logs: fatal error", err);
    await rm(tempPath, { force: true });
    await rm(manifestPath, { force: true });
    process.exitCode = 1;
  } finally {
    // release()/close() must run even if the unlock call itself fails, or a
    // stuck connection leaves the one-shot process hanging instead of exiting.
    try {
      await lockSession`SELECT pg_advisory_unlock(${ARCHIVE_LOCK_KEY})`;
    } finally {
      lockSession.release();
      await close();
    }
  }
}

main().catch((err: unknown) => {
  console.error("archive-logs: unhandled error", err);
  process.exitCode = 1;
});
