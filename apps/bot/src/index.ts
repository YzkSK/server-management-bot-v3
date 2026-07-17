import { startBot } from "./runtime.js";

startBot().catch((err: unknown) => {
  console.error("bot: failed to start", err);
  process.exitCode = 1;
});
