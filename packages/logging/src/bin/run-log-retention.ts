import { createDbConnection, deleteLogEventsOlderThan } from "@sm-bot/db";

import { runLogRetentionCleanup } from "../application/log-retention.js";

async function main(): Promise<void> {
  const { db, close } = createDbConnection();

  try {
    const result = await runLogRetentionCleanup({ db, deleteLogEventsOlderThan });
    console.log("log-retention: cleanup completed", { deleted: result.deleted });
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  console.error("log-retention: cleanup failed", err);
  process.exitCode = 1;
});
