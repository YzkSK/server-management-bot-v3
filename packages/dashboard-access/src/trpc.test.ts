import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TRPCError } from "@trpc/server";

import { CAP } from "@sm-bot/shared";

import { protectedProcedure, requireCapability, router } from "./trpc.js";
import type { DashboardAccessContext } from "./trpc-context.js";

function context(overrides: Partial<DashboardAccessContext> = {}): DashboardAccessContext {
  return {
    userId: "user-1",
    guildId: "guild-1",
    isGuildOwner: false,
    capabilities: 0n,
    ...overrides
  };
}

const testRouter = router({
  whoAmI: protectedProcedure.query(({ ctx }) => {
    const userId: string = ctx.userId;
    return userId;
  }),
  manageVoiceOnly: requireCapability(CAP.MANAGE_VOICE).query(() => "ok")
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

describe("requireCapability", () => {
  it("allows a request whose capabilities include the required bit among others", async () => {
    const caller = testRouter.createCaller(
      context({ capabilities: CAP.VIEW_LOGS | CAP.MANAGE_VOICE })
    );
    assert.equal(await caller.manageVoiceOnly(), "ok");
  });

  it("rejects a request missing the required bit", async () => {
    const caller = testRouter.createCaller(context({ capabilities: CAP.VIEW_LOGS }));
    await assert.rejects(
      () => caller.manageVoiceOnly(),
      (error) => {
        assert.ok(error instanceof TRPCError);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      }
    );
  });

  it("rejects an unauthenticated request before checking capabilities", async () => {
    const caller = testRouter.createCaller(context({ userId: null, capabilities: 0n }));
    await assert.rejects(
      () => caller.manageVoiceOnly(),
      (error) => {
        assert.ok(error instanceof TRPCError);
        assert.equal(error.code, "UNAUTHORIZED");
        return true;
      }
    );
  });
});
