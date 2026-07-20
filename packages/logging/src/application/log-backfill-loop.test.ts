import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  DEFAULT_BACKFILL_INTERVAL_MS,
  MAX_BACKFILL_ITERATIONS_PER_RUN,
  startLogStreamBackfillLoop
} from "./log-backfill-loop.js";
import { DEFAULT_BACKFILL_BATCH_SIZE, type LogBackfillDeps } from "./log-backfill.js";

function createNoopDeps(): LogBackfillDeps {
  return {
    db: {} as LogBackfillDeps["db"],
    redis: { xAdd: async () => "1-0" },
    getUnsyncedLogEvents: async () => [],
    markLogEventStreamSynced: async () => {}
  };
}

describe("startLogStreamBackfillLoop", () => {
  it("runs backfillUnsyncedLogEvents once per interval using the default interval", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const deps = createNoopDeps();
    let calls = 0;
    deps.getUnsyncedLogEvents = async () => {
      calls += 1;
      return [];
    };

    const stop = startLogStreamBackfillLoop(deps);

    t.mock.timers.tick(DEFAULT_BACKFILL_INTERVAL_MS);
    // 1回目のtickのrunがsingle-flight guardをresetするまで(finallyまで)
    // microtaskを流し切ってから、2回目のtickを発火させる。
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    t.mock.timers.tick(DEFAULT_BACKFILL_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();

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

  it("drains multiple batches within a single tick when there is a large backlog", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const deps = createNoopDeps();
    let calls = 0;

    function makeBatch(size: number) {
      return Array.from({ length: size }, (_, i) => ({
        id: `row-${calls}-${i}`,
        eventName: "member.join",
        guildId: "guild-1",
        actorId: null,
        channelId: null,
        messageId: null,
        eventTimestamp: new Date(0),
        receivedAt: new Date(0),
        realtimeEnabled: false,
        payload: {}
      }));
    }

    deps.getUnsyncedLogEvents = async () => {
      calls += 1;
      // 最初の2回はフルバッチ、3回目で空を返してdrain完了を示す。
      if (calls <= 2) {
        return makeBatch(DEFAULT_BACKFILL_BATCH_SIZE);
      }
      return [];
    };

    const stop = startLogStreamBackfillLoop(deps);

    t.mock.timers.tick(DEFAULT_BACKFILL_INTERVAL_MS);
    await new Promise((resolve) => setTimeout(resolve, 50));

    stop();

    assert.equal(calls, 3);
  });

  it("stops after MAX_BACKFILL_ITERATIONS_PER_RUN calls within one tick when the backlog never drains", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const deps = createNoopDeps();
    let calls = 0;

    function makeBatch(size: number) {
      return Array.from({ length: size }, (_, i) => ({
        id: `row-${calls}-${i}`,
        eventName: "member.join",
        guildId: "guild-1",
        actorId: null,
        channelId: null,
        messageId: null,
        eventTimestamp: new Date(0),
        receivedAt: new Date(0),
        realtimeEnabled: false,
        payload: {}
      }));
    }

    deps.getUnsyncedLogEvents = async () => {
      calls += 1;
      return makeBatch(DEFAULT_BACKFILL_BATCH_SIZE);
    };

    const stop = startLogStreamBackfillLoop(deps);

    t.mock.timers.tick(DEFAULT_BACKFILL_INTERVAL_MS);
    await new Promise((resolve) => setTimeout(resolve, 50));

    stop();

    assert.equal(calls, MAX_BACKFILL_ITERATIONS_PER_RUN);
  });

  it("skips a tick that fires while the previous run is still in flight", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const deps = createNoopDeps();
    let calls = 0;
    let resolveFirstCall: (() => void) | undefined;
    const firstCallPending = new Promise<void>((resolve) => {
      resolveFirstCall = resolve;
    });

    deps.getUnsyncedLogEvents = async () => {
      calls += 1;
      if (calls === 1) {
        await firstCallPending;
      }
      return [];
    };

    const stop = startLogStreamBackfillLoop(deps, { intervalMs: 1000 });

    // 1回目のtick: getUnsyncedLogEventsが呼ばれるが、まだ解決しない。
    t.mock.timers.tick(1000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 1, "first tick should have started exactly one run");

    // 前回runが未完了のまま次のtickが発火 → single-flight guardによりskipされ、
    // getUnsyncedLogEventsは呼ばれないはず。
    t.mock.timers.tick(1000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 1, "overlapping tick must not start a second concurrent run");

    // 前回runを解決させ、後続tickで新たな実行が開始されることを確認する。
    resolveFirstCall?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    t.mock.timers.tick(1000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 2, "a subsequent tick after resolution should start a new run");

    stop();
  });
});
