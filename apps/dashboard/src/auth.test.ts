import { describe, expect, test } from "bun:test";
import type { Account, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

import { authOptions } from "./auth";

describe("authOptions.callbacks.jwt", () => {
  test("stores the Discord access token on initial sign-in", async () => {
    const token: JWT = { sub: "user-1" };
    const account = { access_token: "discord-token-abc" } as Account;

    const result = await authOptions.callbacks!.jwt!({
      token,
      account,
      user: undefined as never,
      trigger: "signIn"
    });

    expect(result.discordAccessToken).toBe("discord-token-abc");
  });

  test("keeps the previously stored token on subsequent calls without an account", async () => {
    const token: JWT = { sub: "user-1", discordAccessToken: "discord-token-abc" };

    const result = await authOptions.callbacks!.jwt!({
      token,
      account: null,
      user: undefined as never,
      trigger: "update"
    });

    expect(result.discordAccessToken).toBe("discord-token-abc");
  });
});

describe("authOptions.callbacks.session", () => {
  test("exposes the Discord access token on session.user", async () => {
    const session = { user: {}, expires: "2099-01-01" } as never;
    const token: JWT = { sub: "user-1", discordAccessToken: "discord-token-abc" };

    // next-authの型定義上、sessionコールバックの戻り値は`Session | DefaultSession`という
    // union型になっている(next-auth/core/types.d.tsのCallbacksOptions["session"]を参照)。
    // DefaultSessionはid/discordAccessToken拡張前の狭い型のため、unionのままでは
    // `result.user?.id`等にアクセスできない。実装(auth.ts)のsessionコールバックは常に
    // 拡張済みのSession(next-auth.d.tsでuser.id/discordAccessTokenを追加)を返すため、
    // ここでの`as Session`は実挙動に基づく正当なナローイングである。
    const result = (await authOptions.callbacks!.session!({
      session,
      token,
      user: undefined as never,
      newSession: undefined,
      trigger: "update"
    })) as Session;

    expect(result.user?.id).toBe("user-1");
    expect(result.user?.discordAccessToken).toBe("discord-token-abc");
  });
});
