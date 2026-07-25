import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateArchiveCutoff,
  createArchiveFileName,
  resolveArchiveDir,
  resolveNow,
  toArchiveSummary
} from "./archive-logs.js";

describe("log archive helpers", () => {
  it("uses a 180 day cutoff", () => {
    const cutoff = calculateArchiveCutoff(new Date("2026-05-27T00:00:00.000Z"));

    assert.equal(cutoff.toISOString(), "2025-11-28T00:00:00.000Z");
  });

  it("creates stable gzip archive file names", () => {
    assert.equal(
      createArchiveFileName(new Date("2026-05-27T08:30:00.000Z")),
      "logs_2026-05-27T08-30-00Z.json.gz"
    );
  });

  it("resolves archive dir from the original command directory", () => {
    assert.equal(
      resolveArchiveDir({
        env: {
          INIT_CWD: "C:\\repo"
        },
        cwd: "C:\\repo\\packages\\db"
      }),
      "C:\\repo\\backups\\archive"
    );
  });

  it("resolves archive dir from ARCHIVE_DIR when set", () => {
    assert.equal(
      resolveArchiveDir({
        env: {
          ARCHIVE_DIR: "/custom/archive"
        }
      }),
      "/custom/archive"
    );
  });

  it("resolves now from ARCHIVE_NOW when set, for deterministic tests", () => {
    assert.equal(
      resolveNow({ env: { ARCHIVE_NOW: "2026-05-27T08:30:00.000Z" } }).toISOString(),
      "2026-05-27T08:30:00.000Z"
    );
  });

  it("resolves now to the current time when ARCHIVE_NOW is unset", () => {
    const before = Date.now();
    const resolved = resolveNow({ env: {} }).getTime();
    const after = Date.now();
    assert.ok(resolved >= before && resolved <= after);
  });

  it("summarizes archive execution without leaking row content", () => {
    assert.deepEqual(
      toArchiveSummary({
        archiveBefore: new Date("2025-11-28T00:00:00.000Z"),
        archivedCount: 12,
        outputPath: "backups/archive/logs_2026-05-27T08-30-00Z.json.gz"
      }),
      {
        archiveBefore: "2025-11-28T00:00:00.000Z",
        archivedCount: 12,
        outputPath: "backups/archive/logs_2026-05-27T08-30-00Z.json.gz"
      }
    );
  });
});
