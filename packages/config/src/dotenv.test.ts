import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { loadRootEnv } from "./dotenv.js";

describe("loadRootEnv", () => {
  afterEach(() => {
    delete process.env["SM_BOT_CONFIG_TEST_VALUE"];
  });

  it("loads variables from the given .env file", () => {
    const dir = mkdtempSync(join(tmpdir(), "sm-bot-config-"));
    try {
      const envPath = join(dir, ".env");
      writeFileSync(envPath, "SM_BOT_CONFIG_TEST_VALUE=from-env-file\n");

      loadRootEnv(envPath);

      assert.equal(
        process.env["SM_BOT_CONFIG_TEST_VALUE"],
        "from-env-file"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
