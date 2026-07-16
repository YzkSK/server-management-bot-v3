import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BASELINE_EVERYONE_CAPABILITIES } from "@sm-bot/shared";

import { ensureEveryoneBaselineGrant } from "./dashboard-access.js";

function createFakeDb(initialRows: Array<Record<string, unknown>> = []) {
  const rows = [...initialRows];

  const fakeDb = {
    rows,
    insert() {
      return {
        values(values: Record<string, unknown>) {
          return {
            onConflictDoNothing: () => ({
              returning: async () => {
                const exists = rows.some(
                  (row) =>
                    row.guildId === values.guildId &&
                    row.targetType === values.targetType &&
                    row.targetId === values.targetId
                );
                if (!exists) rows.push({ id: `row-${rows.length}`, ...values });
                return exists ? [] : [{ id: `row-${rows.length - 1}` }];
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

describe("ensureEveryoneBaselineGrant", () => {
  it("creates a grant when none exists for the @everyone role", async () => {
    const db = createFakeDb();

    const result = await ensureEveryoneBaselineGrant(db, {
      guildId: "guild-1",
      everyoneRoleId: "role-everyone"
    });

    assert.equal(result.created, true);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.capabilities, BASELINE_EVERYONE_CAPABILITIES);
  });

  it("does not overwrite an existing grant for the @everyone role", async () => {
    const db = createFakeDb([
      {
        id: "row-0",
        guildId: "guild-1",
        targetType: "role",
        targetId: "role-everyone",
        capabilities: 0n
      }
    ]);

    const result = await ensureEveryoneBaselineGrant(db, {
      guildId: "guild-1",
      everyoneRoleId: "role-everyone"
    });

    assert.equal(result.created, false);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.capabilities, 0n);
  });
});
