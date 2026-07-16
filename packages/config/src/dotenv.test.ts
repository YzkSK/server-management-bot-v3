import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import { loadRootEnv } from "./dotenv.js";

const TEST_KEY = "SM_BOT_CONFIG_TEST_VALUE";
const currentDir = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(currentDir, "../../../../.env");

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

  it("defaults to the repository root .env file", () => {
    originalValue = process.env[TEST_KEY];
    const rootEnvExisted = existsSync(rootEnvPath);
    const rootEnvOriginalContent = rootEnvExisted
      ? readFileSync(rootEnvPath, "utf8")
      : undefined;
    try {
      writeFileSync(rootEnvPath, `${TEST_KEY}=from-root-env\n`);

      loadRootEnv();

      assert.equal(process.env[TEST_KEY], "from-root-env");
    } finally {
      if (rootEnvOriginalContent === undefined) {
        unlinkSync(rootEnvPath);
      } else {
        writeFileSync(rootEnvPath, rootEnvOriginalContent);
      }
    }
  });
});
