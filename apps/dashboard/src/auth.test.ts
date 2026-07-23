import { describe, expect, test } from "bun:test";
import type { Account, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

import { authOptions, createAuthOptions } from "./auth";
import type { DiscordTokenRefreshCacheClient } from "./server/discord-token-refresh";

const dummyCache: DiscordTokenRefreshCacheClient = {
  get: async () => null,
  set: async () => "OK",
  eval: async () => 0
};

describe("authOptions.callbacks.jwt", () => {
  test("stores the Discord access/refresh token and expiry on initial sign-in", async () => {
    const token: JWT = { sub: "user-1" };
    const account = {
      access_token: "discord-token-abc",
      refresh_token: "discord-refresh-abc",
      expires_at: 1_700_000_000
    } as Account;

    const result = await authOptions.callbacks!.jwt!({
      token,
      account,
      user: undefined as never,
      trigger: "signIn"
    });

    expect(result.discordAccessToken).toBe("discord-token-abc");
    expect(result.discordRefreshToken).toBe("discord-refresh-abc");
    expect(result.discordExpiresAt).toBe(1_700_000_000);
  });

  test("keeps the previously stored token when it has not expired yet", async () => {
    const options = createAuthOptions({
      getRedisClient: async () => dummyCache,
      now: () => 1_700_000_000_000,
      refreshDiscordAccessToken: async () => {
        throw new Error("must not attempt a refresh while the token is still valid");
      }
    });
    const token: JWT = {
      sub: "user-1",
      discordAccessToken: "discord-token-abc",
      discordRefreshToken: "discord-refresh-abc",
      discordExpiresAt: 1_700_000_100
    };

    const result = await options.callbacks!.jwt!({
      token,
      account: null,
      user: undefined as never,
      trigger: "update"
    });

    expect(result.discordAccessToken).toBe("discord-token-abc");
    expect(result.discordRefreshToken).toBe("discord-refresh-abc");
  });

  test("refreshes the Discord token when it has expired", async () => {
    const options = createAuthOptions({
      getRedisClient: async () => dummyCache,
      now: () => 1_700_000_200_000,
      refreshDiscordAccessToken: async (input) => {
        expect(input.refreshToken).toBe("discord-refresh-abc");
        return {
          kind: "success",
          token: {
            accessToken: "discord-token-new",
            refreshToken: "discord-refresh-new",
            expiresAt: 1_700_100_000
          }
        };
      }
    });
    const token: JWT = {
      sub: "user-1",
      discordAccessToken: "discord-token-abc",
      discordRefreshToken: "discord-refresh-abc",
      discordExpiresAt: 1_700_000_100
    };

    const result = await options.callbacks!.jwt!({
      token,
      account: null,
      user: undefined as never,
      trigger: "update"
    });

    expect(result.discordAccessToken).toBe("discord-token-new");
    expect(result.discordRefreshToken).toBe("discord-refresh-new");
    expect(result.discordExpiresAt).toBe(1_700_100_000);
  });

  test("clears the Discord token when Discord rejects the refresh_token (invalid_grant)", async () => {
    const options = createAuthOptions({
      getRedisClient: async () => dummyCache,
      now: () => 1_700_000_200_000,
      refreshDiscordAccessToken: async () => ({ kind: "invalid_grant" })
    });
    const token: JWT = {
      sub: "user-1",
      discordAccessToken: "discord-token-abc",
      discordRefreshToken: "discord-refresh-abc",
      discordExpiresAt: 1_700_000_100
    };

    const result = await options.callbacks!.jwt!({
      token,
      account: null,
      user: undefined as never,
      trigger: "update"
    });

    expect(result.discordAccessToken).toBeUndefined();
    expect(result.discordRefreshToken).toBeUndefined();
    expect(result.discordExpiresAt).toBeUndefined();
  });

  test("keeps the existing token on a transient refresh failure so the next request can retry", async () => {
    const options = createAuthOptions({
      getRedisClient: async () => dummyCache,
      now: () => 1_700_000_200_000,
      refreshDiscordAccessToken: async () => ({ kind: "transient_failure" })
    });
    const token: JWT = {
      sub: "user-1",
      discordAccessToken: "discord-token-abc",
      discordRefreshToken: "discord-refresh-abc",
      discordExpiresAt: 1_700_000_100
    };

    const result = await options.callbacks!.jwt!({
      token,
      account: null,
      user: undefined as never,
      trigger: "update"
    });

    expect(result.discordAccessToken).toBe("discord-token-abc");
    expect(result.discordRefreshToken).toBe("discord-refresh-abc");
    expect(result.discordExpiresAt).toBe(1_700_000_100);
  });

  test("keeps the token untouched when there is no refresh_token to fall back on", async () => {
    const options = createAuthOptions({
      getRedisClient: async () => dummyCache,
      refreshDiscordAccessToken: async () => {
        throw new Error("must not attempt a refresh without a refresh_token");
      }
    });
    const token: JWT = { sub: "user-1", discordAccessToken: "discord-token-abc" };

    const result = await options.callbacks!.jwt!({
      token,
      account: null,
      user: undefined as never,
      trigger: "update"
    });

    expect(result.discordAccessToken).toBe("discord-token-abc");
  });
});

describe("authOptions.callbacks.session", () => {
  test("exposes the user id but not the Discord access token on session.user", async () => {
    const session = { user: {}, expires: "2099-01-01" } as never;
    const token: JWT = { sub: "user-1", discordAccessToken: "discord-token-abc" };

    // next-authの型定義上、sessionコールバックの戻り値は`Session | DefaultSession`という
    // union型になっている(next-auth/core/types.d.tsのCallbacksOptions["session"]を参照)。
    // DefaultSessionはid拡張前の狭い型のため、unionのままでは`result.user?.id`等に
    // アクセスできない。実装(auth.ts)のsessionコールバックは常に拡張済みのSession
    // (next-auth.d.tsでuser.idを追加)を返すため、ここでの`as Session`は実挙動に
    // 基づく正当なナローイングである。
    const result = (await authOptions.callbacks!.session!({
      session,
      token,
      user: undefined as never,
      newSession: undefined,
      trigger: "update"
    })) as Session;

    expect(result.user?.id).toBe("user-1");
    expect(result.user).not.toHaveProperty("discordAccessToken");
  });
});
