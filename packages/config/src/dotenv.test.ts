import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import { defaultRootEnvPath, loadRootEnv } from "./dotenv.js";

const TEST_KEY = "SM_BOT_CONFIG_TEST_VALUE";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const packageJsonPath = join(dir, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        name?: string;
      };
      if (packageJson.name === "server-management-bot-v3") {
        return dir;
      }
    }
    const parentDir = dirname(dir);
    if (parentDir === dir) {
      throw new Error("could not locate the repository root from " + startDir);
    }
    dir = parentDir;
  }
}

describe("loadRootEnv", () => {
  let originalValue: string | undefined;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[TEST_KEY];
    } else {
      process.env[TEST_KEY] = originalValue;
    }
  });

  it("loads variables from a given .env file", () => {
    originalValue = process.env[TEST_KEY];
    const dir = mkdtempSync(join(tmpdir(), "sm-bot-config-"));
    try {
      const envPath = join(dir, ".env");
      writeFileSync(envPath, `${TEST_KEY}=from-env-file\n`);

      loadRootEnv(envPath);

      assert.equal(process.env[TEST_KEY], "from-env-file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves its default path to the repository root .env file, without writing to disk", () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = findRepoRoot(currentDir);

    assert.equal(defaultRootEnvPath, join(repoRoot, ".env"));
  });
});
