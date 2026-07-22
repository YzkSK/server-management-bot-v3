import { describe, expect, it } from "bun:test";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";

import { CAP } from "@sm-bot/shared";
import type { DashboardAccessContext } from "@sm-bot/dashboard-access";

import { dashboardAccessRouter } from "./dashboard-access-router.js";

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

async function rejectsWithCode(promise: Promise<unknown>, code: TRPC_ERROR_CODE_KEY) {
  try {
    await promise;
    throw new Error("expected promise to reject");
  } catch (error) {
    expect((error as { code?: unknown }).code).toBe(code);
  }
}

describe("dashboardAccessRouter.me", () => {
  it("returns the caller's own id, owner flag, and capabilities as a wire string", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.VIEW_LOGS })
    );

    const result = await caller.me();

    expect(result.userId).toBe("user-1");
    expect(result.isGuildOwner).toBe(false);
    expect(result.capabilities).toBe(CAP.VIEW_LOGS.toString(10));
  });
});

describe("dashboardAccessRouter.myGuilds", () => {
  it("rejects when the session has no Discord access token", async () => {
    const caller = dashboardAccessRouter.createCaller(context({ discordAccessToken: null }));

    await rejectsWithCode(caller.myGuilds(), "UNAUTHORIZED");
  });
});

describe("dashboardAccessRouter.grant (delegation rules)", () => {
  it("rejects the request entirely if the caller lacks MANAGE_ACCESS", async () => {
    const caller = dashboardAccessRouter.createCaller(context({ capabilities: CAP.VIEW_LOGS }));

    await rejectsWithCode(
      caller.grant({
        guildId: "guild-1",
        targetType: "user",
        targetId: "user-2",
        capabilities: CAP.VIEW_LOGS.toString(10)
      }),
      "FORBIDDEN"
    );
  });

  it("rejects a non-owner granting MANAGE_ACCESS even if they hold it", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.MANAGE_ACCESS })
    );

    await rejectsWithCode(
      caller.grant({
        guildId: "guild-1",
        targetType: "user",
        targetId: "user-2",
        capabilities: CAP.MANAGE_ACCESS.toString(10)
      }),
      "FORBIDDEN"
    );
  });

  it("rejects granting a capability the caller does not hold", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.MANAGE_ACCESS })
    );

    await rejectsWithCode(
      caller.grant({
        guildId: "guild-1",
        targetType: "user",
        targetId: "user-2",
        capabilities: CAP.MANAGE_VOICE.toString(10)
      }),
      "FORBIDDEN"
    );
  });

  it("rejects a malformed capabilities wire string as a client error", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.MANAGE_ACCESS })
    );

    await rejectsWithCode(
      caller.grant({
        guildId: "guild-1",
        targetType: "user",
        targetId: "user-2",
        capabilities: "0x10"
      }),
      "BAD_REQUEST"
    );
  });

  it("rejects granting into a guild other than the caller's authorized guild", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ guildId: "guild-1", capabilities: CAP.MANAGE_ACCESS })
    );

    await rejectsWithCode(
      caller.grant({
        guildId: "guild-2",
        targetType: "user",
        targetId: "user-2",
        capabilities: CAP.MANAGE_VOICE.toString(10)
      }),
      "FORBIDDEN"
    );
  });

  it("allows granting a capability subset of the caller's own capabilities", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.MANAGE_ACCESS | CAP.MANAGE_VOICE })
    );

    const result = await caller.grant({
      guildId: "guild-1",
      targetType: "user",
      targetId: "user-2",
      capabilities: CAP.MANAGE_VOICE.toString(10)
    });

    expect(result).toEqual({ guildId: "guild-1", targetType: "user", targetId: "user-2" });
  });

  it("allows the guild owner to grant MANAGE_ACCESS", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ isGuildOwner: true, capabilities: CAP.MANAGE_ACCESS })
    );

    const result = await caller.grant({
      guildId: "guild-1",
      targetType: "role",
      targetId: "role-1",
      capabilities: CAP.MANAGE_ACCESS.toString(10)
    });

    expect(result).toEqual({ guildId: "guild-1", targetType: "role", targetId: "role-1" });
  });
});
