import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BASELINE_EVERYONE_CAPABILITIES } from "@sm-bot/shared";

import { dashboardAccessGrants, guilds } from "../schema/index.js";
import {
  ensureEveryoneBaselineGrant,
  listGrantsForPrincipal
} from "./dashboard-access.js";

interface PrincipalCriteria {
  guildId: string;
  userId: string;
  roleIds: string[];
}

function createFakeTx(
  rows: Array<Record<string, unknown>>,
  guildRows: Array<Record<string, unknown>>
) {
  return {
    insert(table: unknown) {
      if (table === guilds) {
        return {
          values(values: Record<string, unknown>) {
            return {
              onConflictDoUpdate: async ({
                set
              }: {
                set: Record<string, unknown>;
              }) => {
                const existing = guildRows.find(
                  (row) => row.guildId === values.guildId
                );
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
}

function createFakeDb(
  initialRows: Array<Record<string, unknown>> = [],
  principalCriteria?: PrincipalCriteria
) {
  const rows = [...initialRows];
  const guildRows: Array<Record<string, unknown>> = [];

  const fakeDb = {
    rows,
    guildRows,
    select() {
      return {
        from() {
          return {
            where: async () =>
              rows.filter((row) => {
                if (!principalCriteria) return true;
                if (row.guildId !== principalCriteria.guildId) return false;
                if (
                  row.targetType === "user" &&
                  row.targetId === principalCriteria.userId
                )
                  return true;
                return (
                  row.targetType === "role" &&
                  principalCriteria.roleIds.includes(row.targetId as string)
                );
              })
          };
        }
      };
    },
    transaction: async (
      fn: (tx: ReturnType<typeof createFakeTx>) => Promise<unknown>
    ) => fn(createFakeTx(rows, guildRows))
  };

  return fakeDb as unknown as import("../client.js").DbClient & {
    rows: typeof rows;
    guildRows: typeof guildRows;
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

  it("upserts the parent guild row before seeding the baseline grant", async () => {
    const db = createFakeDb();

    await ensureEveryoneBaselineGrant(db, {
      guildId: "guild-1",
      everyoneRoleId: "role-everyone"
    });

    assert.equal(db.guildRows.length, 1);
    assert.equal(db.guildRows[0]?.guildId, "guild-1");
  });
});

describe("listGrantsForPrincipal", () => {
  it("returns rows matching the user id or any of the role ids", async () => {
    const criteria = {
      guildId: "guild-1",
      userId: "user-1",
      roleIds: ["role-everyone"]
    };
    const db = createFakeDb(
      [
        {
          id: "row-0",
          guildId: "guild-1",
          targetType: "user",
          targetId: "user-1",
          capabilities: 1n
        },
        {
          id: "row-1",
          guildId: "guild-1",
          targetType: "role",
          targetId: "role-everyone",
          capabilities: 2n
        },
        {
          id: "row-2",
          guildId: "guild-1",
          targetType: "role",
          targetId: "role-mod",
          capabilities: 4n
        }
      ],
      criteria
    );

    const rows = await listGrantsForPrincipal(db, criteria);

    assert.deepEqual(
      rows.map((row) => row.id).sort(),
      ["row-0", "row-1"]
    );
  });
});
