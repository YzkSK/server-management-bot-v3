import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { DbClient, ensureEveryoneBaselineGrant as EnsureEveryoneBaselineGrant } from "@sm-bot/db";

import { handleGuildCreate } from "./guild-join.js";

describe("handleGuildCreate", () => {
  it("seeds the @everyone baseline grant for the guild", async () => {
    const ensureEveryoneBaselineGrant = mock.fn<typeof EnsureEveryoneBaselineGrant>(
      async () => ({ created: true })
    );
    const db = {} as DbClient;

    await handleGuildCreate(
      { guildId: "guild-1", everyoneRoleId: "role-everyone" },
      { ensureEveryoneBaselineGrant, db }
    );

    assert.equal(ensureEveryoneBaselineGrant.mock.calls.length, 1);
    const call = ensureEveryoneBaselineGrant.mock.calls[0];
    assert.equal(call?.arguments[0], db);
    assert.deepEqual(call?.arguments[1], {
      guildId: "guild-1",
      everyoneRoleId: "role-everyone"
    });
  });

  it("propagates baseline grant failures", async () => {
    const error = new Error("db failed");
    const ensureEveryoneBaselineGrant = mock.fn<typeof EnsureEveryoneBaselineGrant>(
      async () => {
        throw error;
      }
    );

    await assert.rejects(
      handleGuildCreate(
        { guildId: "guild-1", everyoneRoleId: "role-everyone" },
        { ensureEveryoneBaselineGrant, db: {} as DbClient }
      ),
      error
    );
  });
});
