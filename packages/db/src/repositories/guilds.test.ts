import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { guilds } from "../schema/index.js";
import { upsertGuild } from "./guilds.js";

function createFakeDb(guildRows: Array<Record<string, unknown>>) {
  return {
    insert(table: unknown) {
      assert.equal(table, guilds);
      return {
        values(values: Record<string, unknown>) {
          return {
            onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
              const existing = guildRows.find((row) => row.guildId === values.guildId);
              if (existing) {
                Object.assign(existing, set);
              } else {
                guildRows.push({ ...values });
              }
            }
          };
        }
      };
    }
  };
}

describe("upsertGuild", () => {
  it("inserts a new guild row when it does not exist yet", async () => {
    const guildRows: Array<Record<string, unknown>> = [];
    const db = createFakeDb(guildRows);

    await upsertGuild(db as never, "guild-1");

    assert.equal(guildRows.length, 1);
    assert.equal(guildRows[0]?.guildId, "guild-1");
  });

  it("is a no-op conflict update when the guild row already exists", async () => {
    const guildRows: Array<Record<string, unknown>> = [{ guildId: "guild-1", isActive: false }];
    const db = createFakeDb(guildRows);

    await upsertGuild(db as never, "guild-1");

    assert.equal(guildRows.length, 1);
    assert.equal(guildRows[0]?.isActive, true);
  });
});
