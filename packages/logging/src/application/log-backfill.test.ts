import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type {
  DbClient,
  UnsyncedLogEvent,
  getUnsyncedLogEvents as GetUnsyncedLogEvents,
  markLogEventStreamSynced as MarkLogEventStreamSynced
} from "@sm-bot/db";

import {
  backfillUnsyncedLogEvents,
  DEFAULT_BACKFILL_BATCH_SIZE,
  DEFAULT_BACKFILL_GRACE_PERIOD_MS
} from "./log-backfill.js";
import type { RedisStreamWriter } from "./log-stream.js";

function makeUnsyncedRow(overrides: Partial<UnsyncedLogEvent> = {}): UnsyncedLogEvent {
  return {
    id: "log-1",
    eventName: "member.join",
    guildId: "guild-1",
    actorId: "user-1",
    channelId: null,
    messageId: null,
    eventTimestamp: new Date("2026-07-18T00:00:00.000Z"),
    receivedAt: new Date("2026-07-18T00:00:01.000Z"),
    realtimeEnabled: false,
    payload: { displayName: "test" },
    ...overrides
  };
}

describe("backfillUnsyncedLogEvents", () => {
  it("uses the default batch size and grace period when options are omitted", async () => {
    const getUnsyncedLogEvents = mock.fn<typeof GetUnsyncedLogEvents>(async () => []);
    const markLogEventStreamSynced = mock.fn<typeof MarkLogEventStreamSynced>(async () => {});
    const redis: RedisStreamWriter = { xAdd: async () => "1-0" };
    const db = {} as DbClient;

    await backfillUnsyncedLogEvents({ db, redis, getUnsyncedLogEvents, markLogEventStreamSynced });

    assert.deepEqual(getUnsyncedLogEvents.mock.calls[0]?.arguments[1], {
      limit: DEFAULT_BACKFILL_BATCH_SIZE,
      olderThanMs: DEFAULT_BACKFILL_GRACE_PERIOD_MS
    });
  });

  it("re-appends each unsynced row to the stream and marks it synced", async () => {
    const rows = [makeUnsyncedRow({ id: "log-1" }), makeUnsyncedRow({ id: "log-2" })];
    const getUnsyncedLogEvents = mock.fn<typeof GetUnsyncedLogEvents>(async () => rows);
    const markLogEventStreamSynced = mock.fn<typeof MarkLogEventStreamSynced>(async () => {});
    const xAddCalls: string[] = [];
    const redis: RedisStreamWriter = {
      xAdd: async (key) => {
        xAddCalls.push(key);
        return "1-0";
      }
    };
    const db = {} as DbClient;

    const result = await backfillUnsyncedLogEvents({
      db,
      redis,
      getUnsyncedLogEvents,
      markLogEventStreamSynced
    });

    assert.equal(result.synced, 2);
    assert.equal(result.failed, 0);
    assert.equal(markLogEventStreamSynced.mock.calls.length, 2);
    assert.equal(xAddCalls.filter((key) => key === "logs:events").length, 2);
  });

  it("also re-appends to the per-guild realtime stream when realtimeEnabled is true", async () => {
    const rows = [makeUnsyncedRow({ id: "log-1", realtimeEnabled: true, guildId: "guild-1" })];
    const getUnsyncedLogEvents = mock.fn<typeof GetUnsyncedLogEvents>(async () => rows);
    const markLogEventStreamSynced = mock.fn<typeof MarkLogEventStreamSynced>(async () => {});
    const xAddCalls: string[] = [];
    const redis: RedisStreamWriter = {
      xAdd: async (key) => {
        xAddCalls.push(key);
        return "1-0";
      }
    };
    const db = {} as DbClient;

    await backfillUnsyncedLogEvents({ db, redis, getUnsyncedLogEvents, markLogEventStreamSynced });

    assert.deepEqual(xAddCalls.sort(), ["logs:events", "rt:logs:guild-1"].sort());
  });

  it("continues processing remaining rows when one row fails, and only marks the successful ones synced", async () => {
    const rows = [makeUnsyncedRow({ id: "log-fail" }), makeUnsyncedRow({ id: "log-ok" })];
    const getUnsyncedLogEvents = mock.fn<typeof GetUnsyncedLogEvents>(async () => rows);
    const markLogEventStreamSynced = mock.fn<typeof MarkLogEventStreamSynced>(async () => {});
    let call = 0;
    const redis: RedisStreamWriter = {
      xAdd: async () => {
        call += 1;
        if (call === 1) {
          throw new Error("redis unavailable");
        }
        return "1-0";
      }
    };
    const db = {} as DbClient;

    const result = await backfillUnsyncedLogEvents({
      db,
      redis,
      getUnsyncedLogEvents,
      markLogEventStreamSynced
    });

    assert.equal(result.synced, 1);
    assert.equal(result.failed, 1);
    assert.equal(markLogEventStreamSynced.mock.calls.length, 1);
    assert.equal(markLogEventStreamSynced.mock.calls[0]?.arguments[1], "log-ok");
  });

  it("marks the row failed and logs a distinct message when only markLogEventStreamSynced fails", async () => {
    const rows = [makeUnsyncedRow({ id: "log-1" })];
    const getUnsyncedLogEvents = mock.fn<typeof GetUnsyncedLogEvents>(async () => rows);
    const markLogEventStreamSynced = mock.fn<typeof MarkLogEventStreamSynced>(async () => {
      throw new Error("db unavailable");
    });
    const redis: RedisStreamWriter = { xAdd: async () => "1-0" };
    const db = {} as DbClient;

    const errorSpy = mock.method(console, "error", () => {});
    try {
      const result = await backfillUnsyncedLogEvents({
        db,
        redis,
        getUnsyncedLogEvents,
        markLogEventStreamSynced
      });

      assert.equal(result.synced, 0);
      assert.equal(result.failed, 1);
      assert.equal(errorSpy.mock.calls.length, 1);
      assert.equal(
        errorSpy.mock.calls[0]?.arguments[0],
        "log-backfill: failed to mark log event as stream-synced"
      );
    } finally {
      errorSpy.mock.restore();
    }
  });

  it("treats a normalization error as a failure for only that row", async () => {
    const invalidRow = makeUnsyncedRow({ id: "log-invalid" });
    Object.defineProperty(invalidRow, "payload", {
      get() {
        throw new Error("invalid payload");
      }
    });
    const validRow = makeUnsyncedRow({ id: "log-valid" });
    const getUnsyncedLogEvents = mock.fn<typeof GetUnsyncedLogEvents>(
      async () => [invalidRow, validRow]
    );
    const markLogEventStreamSynced = mock.fn<typeof MarkLogEventStreamSynced>(async () => {});
    const redis: RedisStreamWriter = { xAdd: async () => "1-0" };
    const db = {} as DbClient;

    const errorSpy = mock.method(console, "error", () => {});
    try {
      const result = await backfillUnsyncedLogEvents({
        db,
        redis,
        getUnsyncedLogEvents,
        markLogEventStreamSynced
      });

      assert.deepEqual(result, { synced: 1, failed: 1 });
      assert.equal(markLogEventStreamSynced.mock.calls.length, 1);
      assert.equal(markLogEventStreamSynced.mock.calls[0]?.arguments[1], "log-valid");
    } finally {
      errorSpy.mock.restore();
    }
  });

  it("caps in-flight row processing at the configured concurrency limit", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeUnsyncedRow({ id: `log-${i}` }));
    const getUnsyncedLogEvents = mock.fn<typeof GetUnsyncedLogEvents>(async () => rows);
    const markLogEventStreamSynced = mock.fn<typeof MarkLogEventStreamSynced>(async () => {});

    let inFlight = 0;
    let maxInFlight = 0;
    const redis: RedisStreamWriter = {
      xAdd: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return "1-0";
      }
    };
    const db = {} as DbClient;

    const result = await backfillUnsyncedLogEvents({
      db,
      redis,
      getUnsyncedLogEvents,
      markLogEventStreamSynced
    });

    assert.equal(result.synced, 25);
    assert.ok(maxInFlight <= 10, `expected concurrency to be capped, got ${maxInFlight}`);
  });

  it("respects a custom limit and olderThanMs", async () => {
    const getUnsyncedLogEvents = mock.fn<typeof GetUnsyncedLogEvents>(async () => []);
    const markLogEventStreamSynced = mock.fn<typeof MarkLogEventStreamSynced>(async () => {});
    const redis: RedisStreamWriter = { xAdd: async () => "1-0" };
    const db = {} as DbClient;

    await backfillUnsyncedLogEvents(
      { db, redis, getUnsyncedLogEvents, markLogEventStreamSynced },
      { limit: 5, olderThanMs: 1000 }
    );

    assert.deepEqual(getUnsyncedLogEvents.mock.calls[0]?.arguments[1], {
      limit: 5,
      olderThanMs: 1000
    });
  });
});
