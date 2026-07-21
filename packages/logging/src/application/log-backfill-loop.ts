import {
  backfillUnsyncedLogEvents,
  DEFAULT_BACKFILL_BATCH_SIZE,
  type LogBackfillDeps
} from "./log-backfill.js";

export const DEFAULT_BACKFILL_INTERVAL_MS = 5 * 60 * 1000;

// 1tickあたりのbackfillUnsyncedLogEvents呼び出し回数の上限。
// Redis障害が長引き未同期行が際限なく積み上がった場合でも、intervalコールバックが
// 必ず制御を返すようにするための安全弁(issue #103レビュー指摘)。
// デフォルトのbatchSize(100)なら1tickで最大2000件をdrainできる。
export const MAX_BACKFILL_ITERATIONS_PER_RUN = 20;

export interface LogBackfillLoopOptions {
  intervalMs?: number;
  batchSize?: number;
  graceMs?: number;
}

export function startLogStreamBackfillLoop(
  deps: LogBackfillDeps,
  options: LogBackfillLoopOptions = {}
): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_BACKFILL_INTERVAL_MS;
  const batchSize = options.batchSize ?? DEFAULT_BACKFILL_BATCH_SIZE;

  const backfillOptions: { limit?: number; olderThanMs?: number } = {};
  if (options.batchSize !== undefined) {
    backfillOptions.limit = options.batchSize;
  }
  if (options.graceMs !== undefined) {
    backfillOptions.olderThanMs = options.graceMs;
  }

  // シャットダウン時にこのtickの実行中Promiseを待たない点、および起動直後は
  // 最初のintervalが経過するまでbackfillが走らない点は、いずれもレビューで
  // 検討済みの上で意図的に許容している(at-least-once前提で取りこぼしは
  // 後続tickが回収でき、初回までの遅延もこのワークロードでは許容範囲のため)。
  let isRunning = false;

  const timer = setInterval(() => {
    if (isRunning) {
      // 前回tickのdrainがintervalMsを超えて実行中。多重実行によるRedisへの
      // 重複再送を避けるため、このtickはスキップして次回に委ねる
      // (issue #103レビュー指摘)。
      return;
    }

    isRunning = true;
    void (async () => {
      let totalSynced = 0;
      let totalFailed = 0;

      try {
        for (let iteration = 0; iteration < MAX_BACKFILL_ITERATIONS_PER_RUN; iteration += 1) {
          const result = await backfillUnsyncedLogEvents(deps, backfillOptions);
          totalSynced += result.synced;
          totalFailed += result.failed;

          if (result.synced + result.failed < batchSize) {
            // batchSize未満しか返らなかった = キューがdrainされたので、
            // 次のintervalまで待ってよい。
            break;
          }
        }
      } catch (err: unknown) {
        console.error(
          "log-backfill-loop: backfill run failed unexpectedly",
          { syncedSoFar: totalSynced, failedSoFar: totalFailed },
          err
        );
      } finally {
        isRunning = false;
      }

      if (totalSynced > 0 || totalFailed > 0) {
        console.log("log-backfill-loop: backfill run completed", {
          synced: totalSynced,
          failed: totalFailed
        });
      }
    })();
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}
