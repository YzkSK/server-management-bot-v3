import type { DbClient, deleteLogEventsOlderThan } from "@sm-bot/db";

export const DEFAULT_LOG_RETENTION_DAYS = 180;
export const DEFAULT_RETENTION_BATCH_SIZE = 500;

export interface LogRetentionDeps {
  db: DbClient;
  deleteLogEventsOlderThan: typeof deleteLogEventsOlderThan;
}

export interface LogRetentionResult {
  deleted: number;
}

export async function runLogRetentionCleanup(
  deps: LogRetentionDeps,
  options: { retentionDays?: number; batchSize?: number } = {}
): Promise<LogRetentionResult> {
  const retentionDays = options.retentionDays ?? DEFAULT_LOG_RETENTION_DAYS;
  const batchSize = options.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  let totalDeleted = 0;

  for (;;) {
    const deletedInBatch = await deps.deleteLogEventsOlderThan(deps.db, {
      cutoff,
      limit: batchSize
    });
    totalDeleted += deletedInBatch;

    if (deletedInBatch < batchSize) {
      break;
    }
  }

  return { deleted: totalDeleted };
}
