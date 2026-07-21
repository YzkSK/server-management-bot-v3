// packages/logging/src/application/log-retention.test.ts
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type {
  DbClient,
  deleteLogEventsOlderThan as DeleteLogEventsOlderThan
} from "@sm-bot/db";

import { runLogRetentionCleanup } from "./log-retention.js";

describe("runLogRetentionCleanup", () => {
  it("stops once a batch returns fewer rows than the batch size", async () => {
    const db = {} as DbClient;
    const deleteLogEventsOlderThan = mock.fn<typeof DeleteLogEventsOlderThan>(async () => 3);

    const result = await runLogRetentionCleanup(
      { db, deleteLogEventsOlderThan },
      { batchSize: 10 }
    );

    assert.equal(result.deleted, 3);
    assert.equal(deleteLogEventsOlderThan.mock.calls.length, 1);
  });

  it("loops across multiple full batches until drained", async () => {
    const db = {} as DbClient;
    let call = 0;
    const deleteLogEventsOlderThan = mock.fn<typeof DeleteLogEventsOlderThan>(async () => {
      call += 1;
      if (call <= 2) return 5;
      return 0;
    });

    const result = await runLogRetentionCleanup(
      { db, deleteLogEventsOlderThan },
      { batchSize: 5 }
    );

    assert.equal(result.deleted, 10);
    assert.equal(deleteLogEventsOlderThan.mock.calls.length, 3);
  });

  it("passes a cutoff computed from retentionDays", async () => {
    const db = {} as DbClient;
    const deleteLogEventsOlderThan = mock.fn<typeof DeleteLogEventsOlderThan>(async () => 0);
    const before = Date.now();

    await runLogRetentionCleanup(
      { db, deleteLogEventsOlderThan },
      { retentionDays: 10, batchSize: 100 }
    );

    const call = deleteLogEventsOlderThan.mock.calls[0];
    const passedCutoff = (call?.arguments[1] as { cutoff: Date }).cutoff;
    const expectedCutoffMs = before - 10 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(passedCutoff.getTime() - expectedCutoffMs) < 5000);
  });

  it("returns 0 deleted when the first batch is already empty", async () => {
    const db = {} as DbClient;
    const deleteLogEventsOlderThan = mock.fn<typeof DeleteLogEventsOlderThan>(async () => 0);

    const result = await runLogRetentionCleanup({ db, deleteLogEventsOlderThan });

    assert.equal(result.deleted, 0);
    assert.equal(deleteLogEventsOlderThan.mock.calls.length, 1);
  });
});
