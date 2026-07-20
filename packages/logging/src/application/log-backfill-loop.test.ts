import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  DEFAULT_BACKFILL_INTERVAL_MS,
  startLogStreamBackfillLoop
} from "./log-backfill-loop.js";
import type { LogBackfillDeps } from "./log-backfill.js";

function createNoopDeps(): LogBackfillDeps {
  return {
    db: {} as LogBackfillDeps["db"],
    redis: { xAdd: async () => "1-0" },
    getUnsyncedLogEvents: async () => [],
    markLogEventStreamSynced: async () => {}
  };
}

describe("startLogStreamBackfillLoop", () => {
  it("runs backfillUnsyncedLogEvents once per interval using the default interval", (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const deps = createNoopDeps();
    let calls = 0;
    deps.getUnsyncedLogEvents = async () => {
      calls += 1;
      return [];
    };

    const stop = startLogStreamBackfillLoop(deps);

    t.mock.timers.tick(DEFAULT_BACKFILL_INTERVAL_MS);
    t.mock.timers.tick(DEFAULT_BACKFILL_INTERVAL_MS);

    stop();

    assert.equal(calls, 2);
  });

  it("stops scheduling further runs once stopped", (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const deps = createNoopDeps();
    let calls = 0;
    deps.getUnsyncedLogEvents = async () => {
      calls += 1;
      return [];
    };

    const stop = startLogStreamBackfillLoop(deps, { intervalMs: 1000 });
    t.mock.timers.tick(1000);
    stop();
    t.mock.timers.tick(1000);
    t.mock.timers.tick(1000);

    assert.equal(calls, 1);
  });

  it("does not stop the interval when a single run rejects", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const deps = createNoopDeps();
    let calls = 0;
    deps.getUnsyncedLogEvents = async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("db unavailable");
      }
      return [];
    };

    const stop = startLogStreamBackfillLoop(deps, { intervalMs: 1000 });
    t.mock.timers.tick(1000);
    await Promise.resolve();
    await Promise.resolve();
    t.mock.timers.tick(1000);
    await Promise.resolve();
    await Promise.resolve();
    stop();

    assert.equal(calls, 2);
  });
});
