import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import { refreshDiscordAccessToken, shouldRefreshDiscordToken, type DiscordTokenRefreshCacheClient } from "./discord-token-refresh";

function createInMemoryCache(): DiscordTokenRefreshCacheClient {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry || entry.expiresAt < Date.now()) return null;
      return entry.value;
    },
    async set(key, value, options) {
      if (options.NX && store.has(key) && (store.get(key)?.expiresAt ?? 0) >= Date.now()) {
        return null;
      }
      store.set(key, { value, expiresAt: Date.now() + options.EX * 1000 });
      return "OK";
    },
    async eval(_script, options) {
      const [key] = options.keys;
      const [owner] = options.arguments;
      if (!key) return 0;
      const entry = store.get(key);
      if (entry?.value === owner) {
        store.delete(key);
        return 1;
      }
      return 0;
    }
  };
}

describe("refreshDiscordAccessToken", () => {
  test("calls Discord's token endpoint and returns the refreshed token", async () => {
    const cache = createInMemoryCache();
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://discord.com/api/v10/oauth2/token");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 604800
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "old-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      now: () => 1_000_000,
      fetchImpl
    });

    expect(result).toEqual({
      kind: "success",
      token: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt: Math.floor(1_000_000 / 1000) + 604800
      }
    });
  });

  test("returns invalid_grant when Discord rejects the refresh token with error=invalid_grant", async () => {
    const cache = createInMemoryCache();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "bad-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    expect(result).toEqual({ kind: "invalid_grant" });
  });

  test("returns transient_failure (not invalid_grant) on a 5xx response", async () => {
    const cache = createInMemoryCache();
    const fetchImpl = (async () => new Response("internal error", { status: 503 })) as unknown as typeof fetch;

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "any-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    expect(result).toEqual({ kind: "transient_failure" });
  });

  test("returns transient_failure when fetch itself rejects (network error)", async () => {
    const cache = createInMemoryCache();
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "any-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    expect(result).toEqual({ kind: "transient_failure" });
  });

  test("returns transient_failure when Discord's response is missing required fields", async () => {
    const cache = createInMemoryCache();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ access_token: "a" }), { status: 200 })) as unknown as typeof fetch;

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "any-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    expect(result).toEqual({ kind: "transient_failure" });
  });

  test("reuses a cached success result instead of calling Discord again for the same refresh_token", async () => {
    const cache = createInMemoryCache();
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount += 1;
      return new Response(
        JSON.stringify({ access_token: "a", refresh_token: "b", expires_in: 604800 }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    await refreshDiscordAccessToken({
      cache,
      refreshToken: "shared-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    const second = await refreshDiscordAccessToken({
      cache,
      refreshToken: "shared-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    expect(callCount).toBe(1);
    expect(second).toEqual({
      kind: "success",
      token: { accessToken: "a", refreshToken: "b", expiresAt: expect.any(Number) }
    });
  });

  test("releases the lock after a successful refresh so a later request is not blocked", async () => {
    const cache = createInMemoryCache();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ access_token: "a", refresh_token: "b", expires_in: 604800 }), {
        status: 200
      })) as unknown as typeof fetch;

    await refreshDiscordAccessToken({
      cache,
      refreshToken: "released-lock-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    const lockKey = `dashboard:discord-token-refresh:lock:${createHash("sha256")
      .update("released-lock-refresh-token")
      .digest("hex")}`;
    expect(await cache.get(lockKey)).toBeNull();
  });

  test("a request that loses the lock waits for and reuses the lock holder's result", async () => {
    const cache = createInMemoryCache();
    let resolveFetch: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });

    const fetchImpl = (async () => {
      await blocker;
      return new Response(
        JSON.stringify({ access_token: "a", refresh_token: "b", expires_in: 604800 }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const holderPromise = refreshDiscordAccessToken({
      cache,
      refreshToken: "contended-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    // ロック取得を確実にholder側に先行させる
    await new Promise((resolve) => setTimeout(resolve, 10));

    const waiterPromise = refreshDiscordAccessToken({
      cache,
      refreshToken: "contended-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 20))),
      fetchImpl: (async () => {
        throw new Error("waiter must not call Discord directly");
      }) as unknown as typeof fetch
    });

    setTimeout(() => resolveFetch?.(), 30);

    const [holderResult, waiterResult] = await Promise.all([holderPromise, waiterPromise]);

    const expected = {
      kind: "success" as const,
      token: { accessToken: "a", refreshToken: "b", expiresAt: expect.any(Number) }
    };
    expect(holderResult).toEqual(expected);
    expect(waiterResult).toEqual(expected);
  });

  test("returns transient_failure when the lock holder never produces a result before the wait times out", async () => {
    const cache = createInMemoryCache();
    const holderFetchImpl = (async () => new Promise<Response>(() => {})) as unknown as typeof fetch;

    void refreshDiscordAccessToken({
      cache,
      refreshToken: "stuck-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: holderFetchImpl
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    let callIndex = 0;
    const now = () => {
      callIndex += 1;
      if (callIndex === 1) return 0; // 待機開始時刻(デッドライン計算用)
      if (callIndex <= 3) return 1000 * (callIndex - 1); // まだデッドライン内
      return 20_000; // デッドラインを超過させ、待機を打ち切らせる
    };

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "stuck-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      now,
      wait: async () => {
        // 実時間を待たずポーリングループだけを進める
      },
      fetchImpl: (async () => {
        throw new Error("waiter must not call Discord directly");
      }) as unknown as typeof fetch
    });

    expect(result).toEqual({ kind: "transient_failure" });
  });

  test("returns transient_failure promptly once the lock holder releases without a result, instead of waiting the full timeout", async () => {
    const cache = createInMemoryCache();
    let resolveFetch: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });

    const holderFetchImpl = (async () => {
      await blocker;
      return new Response("service unavailable", { status: 503 });
    }) as unknown as typeof fetch;

    const holderPromise = refreshDiscordAccessToken({
      cache,
      refreshToken: "quick-failure-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: holderFetchImpl
    });

    // ロック取得を確実にholder側に先行させる
    await new Promise((resolve) => setTimeout(resolve, 10));

    const waiterPromise = refreshDiscordAccessToken({
      cache,
      refreshToken: "quick-failure-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: (async () => {
        throw new Error("waiter must not call Discord directly");
      }) as unknown as typeof fetch
    });

    setTimeout(() => resolveFetch?.(), 30);

    const start = Date.now();
    const [holderResult, waiterResult] = await Promise.all([holderPromise, waiterPromise]);
    const elapsedMs = Date.now() - start;

    expect(holderResult).toEqual({ kind: "transient_failure" });
    expect(waiterResult).toEqual({ kind: "transient_failure" });
    // MAX_WAIT_MS(20秒)を待たず、ロック解放を検知して即座に返ることを確認する
    expect(elapsedMs).toBeLessThan(2000);
  });

  test("rechecks the shared result cache after acquiring the lock, avoiding a redundant Discord call", async () => {
    const store = new Map<string, string>();
    let fetchCalled = false;
    const cache: DiscordTokenRefreshCacheClient = {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value, options) => {
        if (options.NX && store.has(key)) return null;
        store.set(key, value);
        if (key.startsWith("dashboard:discord-token-refresh:lock:")) {
          // 自分がロックを取得した直後に、別のリクエストが既にリフレッシュを完了させ
          // 結果キャッシュへ書き込んだ状況を再現する。
          const resultKey = key.replace(":lock:", ":result:");
          store.set(
            resultKey,
            JSON.stringify({
              kind: "success",
              token: { accessToken: "raced-a", refreshToken: "raced-b", expiresAt: 123 }
            })
          );
        }
        return "OK";
      },
      eval: async (_script, options) => {
        const [key] = options.keys;
        const [owner] = options.arguments;
        if (!key) return 0;
        if (store.get(key) === owner) {
          store.delete(key);
          return 1;
        }
        return 0;
      }
    };

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "race-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: (async () => {
        fetchCalled = true;
        return new Response(
          JSON.stringify({ access_token: "x", refresh_token: "y", expires_in: 604800 }),
          { status: 200 }
        );
      }) as unknown as typeof fetch
    });

    expect(fetchCalled).toBe(false);
    expect(result).toEqual({
      kind: "success",
      token: { accessToken: "raced-a", refreshToken: "raced-b", expiresAt: 123 }
    });
  });
});

describe("refreshDiscordAccessToken cache resilience", () => {
  test("returns transient_failure (not an exception) when cache.get fails", async () => {
    const cache: DiscordTokenRefreshCacheClient = {
      get: async () => {
        throw new Error("redis down");
      },
      set: async () => "OK",
      eval: async () => 0
    };

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "any-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: (async () => {
        throw new Error("must not reach Discord when the cache is unavailable");
      }) as unknown as typeof fetch
    });

    expect(result).toEqual({ kind: "transient_failure" });
  });

  test("returns transient_failure (not an exception) when acquiring the lock fails", async () => {
    const cache: DiscordTokenRefreshCacheClient = {
      get: async () => null,
      set: async () => {
        throw new Error("redis down");
      },
      eval: async () => 0
    };

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "any-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: (async () => {
        throw new Error("must not reach Discord when the lock cannot be acquired");
      }) as unknown as typeof fetch
    });

    expect(result).toEqual({ kind: "transient_failure" });
  });

  test("still returns the refreshed token when releasing the lock fails", async () => {
    const store = new Map<string, string>();
    const cache: DiscordTokenRefreshCacheClient = {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value, options) => {
        if (options.NX && store.has(key)) return null;
        store.set(key, value);
        return "OK";
      },
      eval: async () => {
        throw new Error("redis down during unlock");
      }
    };
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ access_token: "a", refresh_token: "b", expires_in: 604800 }), {
        status: 200
      })) as unknown as typeof fetch;

    const result = await refreshDiscordAccessToken({
      cache,
      refreshToken: "lock-release-failure-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl
    });

    expect(result).toEqual({
      kind: "success",
      token: { accessToken: "a", refreshToken: "b", expiresAt: expect.any(Number) }
    });
  });
});

describe("shouldRefreshDiscordToken", () => {
  test("returns false while comfortably before expiry", () => {
    const expiresAt = 1_700_000_600; // 秒
    expect(shouldRefreshDiscordToken(expiresAt, () => 1_700_000_000_000)).toBe(false);
  });

  test("returns true once within the refresh skew margin of expiry", () => {
    const expiresAt = 1_700_000_060; // 秒
    // expiresAtまで30秒(スキュー60秒未満)しかない
    expect(shouldRefreshDiscordToken(expiresAt, () => 1_700_000_030_000)).toBe(true);
  });

  test("returns true once already expired", () => {
    const expiresAt = 1_700_000_000; // 秒
    expect(shouldRefreshDiscordToken(expiresAt, () => 1_700_000_100_000)).toBe(true);
  });
});
