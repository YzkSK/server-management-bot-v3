import { randomUUID } from "node:crypto";
import { once } from "node:events";
import * as fs from "node:fs";
import { link, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";

import { createDbConnection } from "../client.js";
import {
  markLogEventsArchived,
  selectLogEventsOlderThan
} from "../repositories/logs.js";
import {
  calculateArchiveCutoff,
  createArchiveFileName,
  resolveArchiveDir,
  resolveNow,
  toArchiveSummary
} from "./archive-logs.js";

const BATCH_SIZE = 1000;

async function main() {
  const archiveDir = resolveArchiveDir();
  const now = resolveNow();
  const archiveBefore = calculateArchiveCutoff(now);
  const outputPath = join(archiveDir, createArchiveFileName(now));
  const tempPath = `${outputPath}.${randomUUID()}.part`;
  const { db, close } = createDbConnection();

  try {
    await mkdir(archiveDir, { recursive: true });

    // Written to a temp path and gzip/file completion is awaited via
    // pipeline() before the atomic link-publish below, so a crash mid-write
    // never leaves a broken archive at the final path.
    const gzip = zlib.createGzip();
    const outputStream = fs.createWriteStream(tempPath, { flags: "wx" });
    const written = pipeline(gzip, outputStream);

    let cursor: { receivedAt: Date; id: string } | undefined;
    const archivedIds: string[] = [];
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
        archivedIds.push(row.id);
      }

      const last = batch[batch.length - 1];
      if (!last) break;
      cursor = { receivedAt: last.receivedAt, id: last.id };

      if (batch.length < BATCH_SIZE) break;
    }

    gzip.end("]");
    await written;

    // link() atomically fails with EEXIST if outputPath already exists,
    // unlike rename() which would silently replace it — so a same-second
    // collision fails loudly instead of destroying a prior archive.
    await link(tempPath, outputPath);
    await rm(tempPath, { force: true });

    // Only rows confirmed written to the renamed archive are marked, so
    // log-retention (which only deletes archivedAt IS NOT NULL rows) never
    // deletes data that isn't durably archived yet.
    for (let i = 0; i < archivedIds.length; i += BATCH_SIZE) {
      await markLogEventsArchived(db, archivedIds.slice(i, i + BATCH_SIZE));
    }

    const summary = toArchiveSummary({
      archiveBefore,
      archivedCount: archivedIds.length,
      outputPath
    });

    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error("archive-logs: fatal error", err);
    await rm(tempPath, { force: true });
    process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  console.error("archive-logs: unhandled error", err);
  process.exitCode = 1;
});
