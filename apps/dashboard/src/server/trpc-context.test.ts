import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DiscordApiError, DiscordUnknownGuildError } from "@sm-bot/dashboard-access";
import type { NextRequest } from "next/server";

import { createContext } from "./trpc-context.js";

function fakeRequest(headers: Record<string, string> = {}): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

const NOOP_DEPS = {
  getDashboardDb: () => ({}) as never,
  getDashboardRedisClient: async () => ({}) as never
};

describe("createContext", () => {
  it("returns an unauthenticated context without calling resolveDashboardAccessForRequest when there is no token", async () => {
    const context = await createContext(fakeRequest({ "x-guild-id": "guild-1" }), {
      ...NOOP_DEPS,
      getToken: (async () => null) as never,
      resolveDashboardAccessForRequest: async () => {
        throw new Error("should not be called without a userId");
      }
    });

    assert.deepEqual(context, {
      userId: null,
      guildId: "guild-1",
      isGuildOwner: false,
      capabilities: 0n,
      discordAccessToken: null
    });
  });

  it("returns an unauthenticated context without calling resolveDashboardAccessForRequest when there is no x-guild-id header", async () => {
    const context = await createContext(fakeRequest(), {
      ...NOOP_DEPS,
      getToken: async () => ({ sub: "user-1", discordAccessToken: "discord-token" }) as never,
      resolveDashboardAccessForRequest: async () => {
        throw new Error("should not be called without a guildId");
      }
    });

    assert.deepEqual(context, {
      userId: "user-1",
      guildId: null,
      isGuildOwner: false,
      capabilities: 0n,
      discordAccessToken: "discord-token"
    });
  });

  it("reads the Discord access token from the JWT, not from a session", async () => {
    const context = await createContext(fakeRequest({ "x-guild-id": "guild-1" }), {
      ...NOOP_DEPS,
      getToken: async () => ({ sub: "user-1", discordAccessToken: "discord-token" }) as never,
      resolveDashboardAccessForRequest: async () => ({ isGuildOwner: true, capabilities: 0n })
    });

    assert.equal(context.discordAccessToken, "discord-token");
    assert.equal(context.isGuildOwner, true);
  });

  it("treats a DiscordUnknownGuildError (bot not in guild) as an unauthenticated context instead of throwing", async () => {
    const context = await createContext(fakeRequest({ "x-guild-id": "unknown-guild" }), {
      ...NOOP_DEPS,
      getToken: async () => ({ sub: "user-1", discordAccessToken: "discord-token" }) as never,
      resolveDashboardAccessForRequest: async () => {
        throw new DiscordUnknownGuildError("unknown-guild");
      }
    });

    assert.deepEqual(context, {
      userId: "user-1",
      guildId: "unknown-guild",
      isGuildOwner: false,
      capabilities: 0n,
      discordAccessToken: "discord-token"
    });
  });

  it("rethrows a non-404 error from resolveDashboardAccessForRequest instead of swallowing it", async () => {
    await assert.rejects(
      () =>
        createContext(fakeRequest({ "x-guild-id": "guild-1" }), {
          ...NOOP_DEPS,
          getToken: async () => ({ sub: "user-1", discordAccessToken: "discord-token" }) as never,
          resolveDashboardAccessForRequest: async () => {
            throw new DiscordApiError("Unauthorized.", 401);
          }
        }),
      (error: unknown) => error instanceof DiscordApiError && error.status === 401
    );
  });

  it("rethrows an unexpected 404 DiscordApiError (unknown code, not Unknown Guild) instead of swallowing it", async () => {
    await assert.rejects(
      () =>
        createContext(fakeRequest({ "x-guild-id": "guild-1" }), {
          ...NOOP_DEPS,
          getToken: async () => ({ sub: "user-1", discordAccessToken: "discord-token" }) as never,
          resolveDashboardAccessForRequest: async () => {
            throw new DiscordApiError("Unexpected 404 from Discord guild lookup (code: 99999).", 404);
          }
        }),
      (error: unknown) =>
        error instanceof DiscordApiError && !(error instanceof DiscordUnknownGuildError) && error.status === 404
    );
  });
});
