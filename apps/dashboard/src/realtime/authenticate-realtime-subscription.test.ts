import { describe, expect, test } from "bun:test";

import { CAP } from "@sm-bot/shared";
import { DiscordUnknownGuildError } from "@sm-bot/dashboard-access";
import type { DbClient } from "@sm-bot/db";

import { authenticateRealtimeSubscription } from "./authenticate-realtime-subscription";

const BASE_INPUT = {
  headers: { cookie: "next-auth.session-token=fake" },
  guildId: "guild-1",
  nextAuthSecret: "secret",
  botToken: "bot-token",
  db: {} as DbClient,
  cache: {} as never
};

describe("authenticateRealtimeSubscription", () => {
  test("rejects as unauthenticated when getToken returns no sub", async () => {
    const result = await authenticateRealtimeSubscription(BASE_INPUT, {
      getToken: async () => null as never,
      resolveDashboardAccessForRequest: async () => {
        throw new Error("must not be called");
      }
    });

    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
  });

  test("rejects as forbidden when the user lacks VIEW_LOGS", async () => {
    const result = await authenticateRealtimeSubscription(BASE_INPUT, {
      getToken: async () => ({ sub: "user-1" }) as never,
      resolveDashboardAccessForRequest: async () => ({
        isGuildOwner: false,
        capabilities: 0n
      })
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  test("rejects as forbidden when the guild is unknown to Discord", async () => {
    const result = await authenticateRealtimeSubscription(BASE_INPUT, {
      getToken: async () => ({ sub: "user-1" }) as never,
      resolveDashboardAccessForRequest: async () => {
        throw new DiscordUnknownGuildError("guild-1");
      }
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  test("resolves ok with canViewRaw=true when the user has VIEW_LOGS_RAW", async () => {
    const result = await authenticateRealtimeSubscription(BASE_INPUT, {
      getToken: async () => ({ sub: "user-1" }) as never,
      resolveDashboardAccessForRequest: async () => ({
        isGuildOwner: false,
        capabilities: CAP.VIEW_LOGS | CAP.VIEW_LOGS_RAW
      })
    });

    expect(result).toEqual({ ok: true, userId: "user-1", canViewRaw: true });
  });

  test("resolves ok with canViewRaw=false when the user only has VIEW_LOGS", async () => {
    const result = await authenticateRealtimeSubscription(BASE_INPUT, {
      getToken: async () => ({ sub: "user-1" }) as never,
      resolveDashboardAccessForRequest: async () => ({
        isGuildOwner: false,
        capabilities: CAP.VIEW_LOGS
      })
    });

    expect(result).toEqual({ ok: true, userId: "user-1", canViewRaw: false });
  });
});
