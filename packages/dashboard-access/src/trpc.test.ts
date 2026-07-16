import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "./trpc.js";
import type { DashboardAccessContext } from "./trpc-context.js";

function context(overrides: Partial<DashboardAccessContext> = {}): DashboardAccessContext {
  return { userId: "user-1", isGuildOwner: false, capabilities: 0n, ...overrides };
}

const testRouter = router({
  whoAmI: protectedProcedure.query(({ ctx }) => {
    const userId: string = ctx.userId;
    return userId;
  })
});

describe("protectedProcedure", () => {
  it("resolves for an authenticated user", async () => {
    const caller = testRouter.createCaller(context());
    assert.equal(await caller.whoAmI(), "user-1");
  });

  it("rejects an unauthenticated request", async () => {
    const caller = testRouter.createCaller(context({ userId: null }));
    await assert.rejects(
      () => caller.whoAmI(),
      (error) => {
        assert.ok(error instanceof TRPCError);
        assert.equal(error.code, "UNAUTHORIZED");
        return true;
      }
    );
  });
});
