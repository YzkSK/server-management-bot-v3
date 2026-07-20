import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getGuildLogMode, isGuildLogMode, setGuildLogMode } from "./guild-configs.js";

function createFakeDb(initialRows: Array<Record<string, unknown>> = []) {
  const rows = [...initialRows];

  const fakeDb = {
    rows,
    select() {
      return {
        from() {
          return {
            // このフェイクは1テストにつき単一guildIdのシード行のみを扱う想定のため、
            // dashboard-access.test.tsの慣習にならいwhereの条件式自体は評価しない。
            where: () => ({
              limit: async () => rows.map((row) => ({ logMode: row.logMode }))
            })
          };
        }
      };
    },
    insert() {
      return {
        values(values: Record<string, unknown>) {
          return {
            onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
              returning: async () => {
                const existing = rows.find((row) => row.guildId === values.guildId);
                if (existing) {
                  Object.assign(existing, set);
                  return [existing];
                }
                const created = { id: `row-${rows.length}`, ...values };
                rows.push(created);
                return [created];
              }
            })
          };
        }
      };
    }
  };

  return fakeDb as unknown as import("../client.js").DbClient & {
    rows: typeof rows;
  };
}

describe("isGuildLogMode", () => {
  it("accepts only full, metadata_only, and disabled", () => {
    assert.equal(isGuildLogMode("full"), true);
    assert.equal(isGuildLogMode("metadata_only"), true);
    assert.equal(isGuildLogMode("disabled"), true);
    assert.equal(isGuildLogMode("unknown"), false);
  });
});

describe("getGuildLogMode", () => {
  it("returns the configured log mode for the guild", async () => {
    const db = createFakeDb([{ guildId: "guild-1", logMode: "metadata_only" }]);

    const logMode = await getGuildLogMode(db, "guild-1");

    assert.equal(logMode, "metadata_only");
  });

  it("defaults to full when the guild has no config row yet", async () => {
    const db = createFakeDb();

    const logMode = await getGuildLogMode(db, "guild-without-config");

    assert.equal(logMode, "full");
  });
});

describe("setGuildLogMode", () => {
  it("creates a config row when none exists", async () => {
    const db = createFakeDb();

    const config = await setGuildLogMode(db, "guild-1", "disabled");

    assert.equal(config.logMode, "disabled");
    assert.equal(db.rows.length, 1);
  });

  it("updates the existing config row instead of creating a duplicate", async () => {
    const db = createFakeDb([{ guildId: "guild-1", logMode: "full" }]);

    await setGuildLogMode(db, "guild-1", "metadata_only");

    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.logMode, "metadata_only");
  });
});
