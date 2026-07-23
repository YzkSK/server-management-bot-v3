import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TRPCError } from "@trpc/server";

import { CAP, type LogCategory } from "@sm-bot/shared";
import type { DashboardAccessContext } from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";

import { createLogsRouter } from "./logs-router.js";

function context(overrides: Partial<DashboardAccessContext> = {}): DashboardAccessContext {
  return {
    userId: "user-1",
    guildId: "guild-1",
    isGuildOwner: false,
    capabilities: 0n,
    discordAccessToken: null,
    ...overrides
  };
}

const FAKE_DB = {} as DbClient;

function router(
  fakeListLogEvents: (
    db: DbClient,
    input: { guildId: string; eventNamePrefixes?: readonly string[] | null; before?: { receivedAt: Date; id: string }; limit: number }
  ) => Promise<unknown[]>
) {
  return createLogsRouter({
    getDb: () => FAKE_DB,
    listLogEvents: fakeListLogEvents as never
  });
}

describe("logsRouter.list", () => {
  it("rejects a caller without VIEW_LOGS", async () => {
    const caller = router(async () => []).createCaller(context({ capabilities: 0n }));

    await assert.rejects(
      () => caller.list({ category: "all" }),
      (error) => {
        assert.ok(error instanceof TRPCError);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("strips payload when the caller lacks VIEW_LOGS_RAW", async () => {
    const caller = router(async () => [
      {
        id: "log-1",
        eventName: "member.join",
        guildId: "guild-1",
        actorId: null,
        channelId: null,
        messageId: null,
        eventTimestamp: new Date("2026-01-01T00:00:00.000Z"),
        receivedAt: new Date("2026-01-01T00:00:00.000Z"),
        realtimeEnabled: false,
        payload: { secret: "value" }
      }
    ]).createCaller(context({ capabilities: CAP.VIEW_LOGS }));

    const result = await caller.list({ category: "all" });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.payload, null);
  });

  it("includes payload when the caller holds VIEW_LOGS_RAW", async () => {
    const caller = router(async () => [
      {
        id: "log-1",
        eventName: "member.join",
        guildId: "guild-1",
        actorId: null,
        channelId: null,
        messageId: null,
        eventTimestamp: new Date("2026-01-01T00:00:00.000Z"),
        receivedAt: new Date("2026-01-01T00:00:00.000Z"),
        realtimeEnabled: false,
        payload: { secret: "value" }
      }
    ]).createCaller(context({ capabilities: CAP.VIEW_LOGS | CAP.VIEW_LOGS_RAW }));

    const result = await caller.list({ category: "all" });

    assert.deepEqual(result.items[0]?.payload, { secret: "value" });
  });

  it("passes the category's event name prefixes through to listLogEvents", async () => {
    let capturedPrefixes: readonly string[] | null | undefined;
    const caller = router(async (_db, input) => {
      capturedPrefixes = input.eventNamePrefixes;
      return [];
    }).createCaller(context({ capabilities: CAP.VIEW_LOGS }));

    await caller.list({ category: "message" satisfies LogCategory });

    assert.deepEqual(capturedPrefixes, ["message."]);
  });

  it("requests one extra row to compute nextCursor, and trims it from the result", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `log-${i}`,
      eventName: "member.join",
      guildId: "guild-1",
      actorId: null,
      channelId: null,
      messageId: null,
      eventTimestamp: new Date(0),
      receivedAt: new Date(2026, 0, 3 - i),
      realtimeEnabled: false,
      payload: {}
    }));
    let capturedLimit = 0;
    const caller = router(async (_db, input) => {
      capturedLimit = input.limit;
      return rows;
    }).createCaller(context({ capabilities: CAP.VIEW_LOGS }));

    const result = await caller.list({ category: "all", limit: 2 });

    assert.equal(capturedLimit, 3);
    assert.equal(result.items.length, 2);
    assert.deepEqual(result.nextCursor, {
      receivedAt: rows[1]!.receivedAt.toISOString(),
      id: rows[1]!.id
    });
  });

  it("returns a null nextCursor when there is no more data", async () => {
    const caller = router(async () => []).createCaller(context({ capabilities: CAP.VIEW_LOGS }));

    const result = await caller.list({ category: "all" });

    assert.equal(result.nextCursor, null);
  });

  it("converts cursor's receivedAt string to a Date object when passed to listLogEvents", async () => {
    let capturedBefore: { receivedAt: Date; id: string } | undefined;
    const caller = router(async (_db, input) => {
      capturedBefore = input.before;
      return [];
    }).createCaller(context({ capabilities: CAP.VIEW_LOGS }));

    await caller.list({
      category: "all",
      cursor: {
        receivedAt: "2026-01-02T00:00:00.000Z",
        id: "550e8400-e29b-41d4-a716-446655440000"
      }
    });

    assert.ok(capturedBefore, "before should be defined");
    assert.deepEqual(capturedBefore!.receivedAt, new Date("2026-01-02T00:00:00.000Z"));
    assert.equal(capturedBefore!.id, "550e8400-e29b-41d4-a716-446655440000");
  });
});
