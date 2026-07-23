import { describe, expect, test } from "bun:test";
import { decode, encode, type JWT } from "next-auth/jwt";
import { NextRequest } from "next/server";

import { createProxy } from "./proxy";
import type { DiscordTokenRefreshCacheClient } from "./server/discord-token-refresh";

function requireNextAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET must be set for proxy.test.ts");
  return secret;
}
const SECRET = requireNextAuthSecret();

// .envのNEXTAUTH_URL=http://localhost:3000(非https)に対応する、Proxyが実際に
// 使うCookie名。https環境ではproxy.ts側が"__Secure-next-auth.session-token"を使う。
const COOKIE_NAME = "next-auth.session-token";

const dummyCache: DiscordTokenRefreshCacheClient = {
  get: async () => null,
  set: async () => "OK",
  eval: async () => 0
};

async function buildRequest(tokenPayload: JWT): Promise<NextRequest> {
  const encoded = await encode({ token: tokenPayload, secret: SECRET, maxAge: 30 * 24 * 60 * 60 });
  return new NextRequest("http://localhost:3000/g/guild-1", {
    headers: { cookie: `${COOKIE_NAME}=${encoded}` }
  });
}

describe("proxy", () => {
  test("passes through untouched when there is no Discord refresh token", async () => {
    const proxy = createProxy({ getRedisClient: async () => dummyCache });
    const req = await buildRequest({ sub: "user-1" });

    const response = await proxy(req);

    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });

  test("passes through untouched when the token is not yet due for refresh", async () => {
    const proxy = createProxy({
      getRedisClient: async () => dummyCache,
      refreshDiscordAccessToken: async () => {
        throw new Error("must not attempt a refresh while the token is still valid");
      }
    });
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const req = await buildRequest({
      sub: "user-1",
      discordAccessToken: "access-abc",
      discordRefreshToken: "refresh-abc",
      discordExpiresAt: futureExpiry
    });

    const response = await proxy(req);

    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });

  test("rewrites both the request and response session cookie with the refreshed tokens", async () => {
    const proxy = createProxy({
      getRedisClient: async () => dummyCache,
      refreshDiscordAccessToken: async (input) => {
        expect(input.refreshToken).toBe("refresh-abc");
        return {
          kind: "success",
          token: {
            accessToken: "access-new",
            refreshToken: "refresh-new",
            expiresAt: Math.floor(Date.now() / 1000) + 604800
          }
        };
      }
    });
    const pastExpiry = Math.floor(Date.now() / 1000) - 10;
    const req = await buildRequest({
      sub: "user-1",
      discordAccessToken: "access-abc",
      discordRefreshToken: "refresh-abc",
      discordExpiresAt: pastExpiry
    });

    const response = await proxy(req);

    const responseCookie = response.cookies.get(COOKIE_NAME);
    expect(responseCookie).toBeDefined();
    const decoded = await decode({ token: responseCookie?.value ?? "", secret: SECRET });
    expect(decoded?.discordAccessToken).toBe("access-new");
    expect(decoded?.discordRefreshToken).toBe("refresh-new");

    // 同一リクエスト内の後続処理(SSR/tRPC)が更新後の値を読めることも確認する
    const requestCookie = req.cookies.get(COOKIE_NAME);
    expect(requestCookie?.value).toBe(responseCookie?.value);
  });

  test("clears the Discord tokens on invalid_grant, deferring to the re-login flow", async () => {
    const proxy = createProxy({
      getRedisClient: async () => dummyCache,
      refreshDiscordAccessToken: async () => ({ kind: "invalid_grant" })
    });
    const pastExpiry = Math.floor(Date.now() / 1000) - 10;
    const req = await buildRequest({
      sub: "user-1",
      discordAccessToken: "access-abc",
      discordRefreshToken: "refresh-abc",
      discordExpiresAt: pastExpiry
    });

    const response = await proxy(req);

    const responseCookie = response.cookies.get(COOKIE_NAME);
    expect(responseCookie).toBeDefined();
    const decoded = await decode({ token: responseCookie?.value ?? "", secret: SECRET });
    expect(decoded?.discordAccessToken).toBeUndefined();
    expect(decoded?.discordRefreshToken).toBeUndefined();
  });

  test("leaves the cookie untouched on a transient failure so the next request can retry", async () => {
    const proxy = createProxy({
      getRedisClient: async () => dummyCache,
      refreshDiscordAccessToken: async () => ({ kind: "transient_failure" })
    });
    const pastExpiry = Math.floor(Date.now() / 1000) - 10;
    const req = await buildRequest({
      sub: "user-1",
      discordAccessToken: "access-abc",
      discordRefreshToken: "refresh-abc",
      discordExpiresAt: pastExpiry
    });

    const response = await proxy(req);

    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });

  test("leaves the cookie untouched when Redis is unavailable", async () => {
    const proxy = createProxy({
      getRedisClient: async () => {
        throw new Error("redis down");
      }
    });
    const pastExpiry = Math.floor(Date.now() / 1000) - 10;
    const req = await buildRequest({
      sub: "user-1",
      discordAccessToken: "access-abc",
      discordRefreshToken: "refresh-abc",
      discordExpiresAt: pastExpiry
    });

    const response = await proxy(req);

    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });

  test("does not attempt a refresh when the session is already past its own expiry", async () => {
    const proxy = createProxy({
      getRedisClient: async () => dummyCache,
      refreshDiscordAccessToken: async () => {
        throw new Error("must not attempt a refresh when the session itself cannot be persisted");
      }
    });
    const pastDiscordExpiry = Math.floor(Date.now() / 1000) - 10;
    const encoded = await encode({
      token: {
        sub: "user-1",
        discordAccessToken: "access-abc",
        discordRefreshToken: "refresh-abc",
        discordExpiresAt: pastDiscordExpiry
      },
      secret: SECRET,
      // getToken()のclockTolerance(15秒)以内に収まる程度にexpを過去にし、
      // decode自体は成功しつつ「残り有効時間なし」の分岐を再現する。
      maxAge: -5
    });
    const req = new NextRequest("http://localhost:3000/g/guild-1", {
      headers: { cookie: `${COOKIE_NAME}=${encoded}` }
    });

    const response = await proxy(req);

    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });

  test("leaves existing chunked session cookies untouched", async () => {
    const proxy = createProxy({
      getRedisClient: async () => dummyCache,
      refreshDiscordAccessToken: async () => {
        throw new Error("must not attempt a refresh when an existing chunked cookie is present");
      }
    });
    const pastExpiry = Math.floor(Date.now() / 1000) - 10;
    const encoded = await encode({
      token: {
        sub: "user-1",
        discordAccessToken: "access-abc",
        discordRefreshToken: "refresh-abc",
        discordExpiresAt: pastExpiry
      },
      secret: SECRET,
      maxAge: 30 * 24 * 60 * 60
    });
    const req = new NextRequest("http://localhost:3000/g/guild-1", {
      headers: { cookie: `${COOKIE_NAME}=${encoded}; ${COOKIE_NAME}.0=chunk-placeholder` }
    });

    const response = await proxy(req);

    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });
});
