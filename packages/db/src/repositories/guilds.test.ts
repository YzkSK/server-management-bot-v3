import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { and, eq, inArray } from "drizzle-orm";

import { guilds } from "../schema/index.js";
import { getKnownGuildIds, upsertGuild } from "./guilds.js";

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

  it("reactivates an existing guild row on conflict", async () => {
    const guildRows: Array<Record<string, unknown>> = [{ guildId: "guild-1", isActive: false }];
    const db = createFakeDb(guildRows);

    await upsertGuild(db as never, "guild-1");

    assert.equal(guildRows.length, 1);
    assert.equal(guildRows[0]?.isActive, true);
  });
});

describe("getKnownGuildIds", () => {
  it("returns an empty set for an empty input array without querying", async () => {
    const db = {
      select() {
        throw new Error("should not be called");
      }
    };

    const result = await getKnownGuildIds(db as never, []);

    assert.deepEqual(result, new Set());
  });

  it("returns only the guild ids that exist in the guilds table", async () => {
    const rows = [{ guildId: "guild-1" }, { guildId: "guild-2" }];
    const db = {
      select() {
        return {
          from() {
            return {
              where: async () => rows
            };
          }
        };
      }
    };

    const result = await getKnownGuildIds(db as never, ["guild-1", "guild-2", "guild-3"]);

    assert.deepEqual(result, new Set(["guild-1", "guild-2"]));
  });

  it("filters the query on isActive = true, excluding inactive guilds", async () => {
    // このモックのwhere()は渡された条件を無視して固定のrowsを返す(既存テストと同様)。
    // isActiveフィルタが実際にクエリへ組み込まれていることを検証するため、
    // where()に渡された条件そのものを捕捉し、期待するSQL条件と比較する。
    const guildIds = ["guild-1", "guild-2", "guild-3"];
    let capturedWhereArg: unknown;
    const db = {
      select() {
        return {
          from() {
            return {
              where: async (whereArg: unknown) => {
                capturedWhereArg = whereArg;
                // 実DBは isActive=false のguild-3を除外して返す想定
                return [{ guildId: "guild-1" }, { guildId: "guild-2" }];
              }
            };
          }
        };
      }
    };

    const result = await getKnownGuildIds(db as never, guildIds);

    assert.deepEqual(result, new Set(["guild-1", "guild-2"]));

    const expectedWhereArg = and(
      inArray(guilds.guildId, guildIds),
      eq(guilds.isActive, true)
    );
    assert.deepStrictEqual(capturedWhereArg, expectedWhereArg);
  });
});
