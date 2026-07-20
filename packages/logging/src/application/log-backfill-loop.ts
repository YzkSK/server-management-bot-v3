import { backfillUnsyncedLogEvents, type LogBackfillDeps } from "./log-backfill.js";

export const DEFAULT_BACKFILL_INTERVAL_MS = 5 * 60 * 1000;

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

  const timer = setInterval(() => {
    const backfillOptions: { limit?: number; olderThanMs?: number } = {};
    if (options.batchSize !== undefined) {
      backfillOptions.limit = options.batchSize;
    }
    if (options.graceMs !== undefined) {
      backfillOptions.olderThanMs = options.graceMs;
    }

    void backfillUnsyncedLogEvents(deps, backfillOptions)
      .then((result) => {
        if (result.synced > 0 || result.failed > 0) {
          console.log("log-backfill-loop: backfill run completed", result);
        }
      })
      .catch((err: unknown) => {
        console.error("log-backfill-loop: backfill run failed unexpectedly", err);
      });
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}
