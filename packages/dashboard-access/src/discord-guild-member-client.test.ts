import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
  DISCORD_MAX_RETRY_AFTER_MS,
  DiscordApiError,
  DiscordUnknownGuildError,
  fetchGuildInfo,
  fetchGuildMemberAccess,
  MAX_DISCORD_FETCH_ATTEMPTS
} from "./discord-guild-member-client.js";

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

const BOT_TOKEN = "bot-token";
const GUILD_ID = "guild-1";
const USER_ID = "user-1";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchGuildMemberAccess", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns roleIds (including the @everyone role) and isGuildOwner=false when the member is not the guild owner", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(200, { roles: ["role-a", "role-b"] });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    const result = await fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });

    assert.deepEqual(result, {
      roleIds: [GUILD_ID, "role-a", "role-b"],
      isGuildOwner: false
    });
  });

  it("includes the @everyone role id even when the member has no other roles", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(200, { roles: [] });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    const result = await fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });

    assert.deepEqual(result, { roleIds: [GUILD_ID], isGuildOwner: false });
  });

  it("returns isGuildOwner=true when the guild owner_id matches the user", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(200, { roles: [] });
      }
      return jsonResponse(200, { owner_id: USER_ID });
    });

    const result = await fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });

    assert.deepEqual(result, { roleIds: [GUILD_ID], isGuildOwner: true });
  });

  it("returns null when the member lookup responds 404 (left the guild)", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(404, { message: "Unknown Member", code: 10007 });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    const result = await fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });

    assert.equal(result, null);
  });

  it("throws DiscordApiError when the member lookup fails with a non-404 error", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(500, { message: "Internal Server Error" });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    const resultPromise = fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });
    const assertionPromise = assert.rejects(
      () => resultPromise,
      (error: unknown) => error instanceof DiscordApiError && error.status === 500
    );

    for (let i = 0; i < MAX_DISCORD_FETCH_ATTEMPTS; i += 1) {
      await flushMicrotasks();
      t.mock.timers.tick(60_000);
    }

    await assertionPromise;
  });

  it("throws DiscordApiError immediately without retrying when the guild owner lookup fails with a non-retryable 4xx", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(200, { roles: [] });
      }
      return jsonResponse(403, { message: "Forbidden" });
    });

    await assert.rejects(
      () => fetchGuildMemberAccess({ botToken: BOT_TOKEN, guildId: GUILD_ID, userId: USER_ID }),
      (error: unknown) => error instanceof DiscordApiError && error.status === 403
    );
  });

  it("retries the member lookup after a 429 response, honoring Retry-After, and succeeds", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let memberCallCount = 0;
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        memberCallCount += 1;
        if (memberCallCount === 1) {
          return new Response(null, { status: 429, headers: { "Retry-After": "2" } });
        }
        return jsonResponse(200, { roles: [] });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    const resultPromise = fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });
    await flushMicrotasks();
    assert.equal(memberCallCount, 1);

    t.mock.timers.tick(1_999);
    await flushMicrotasks();
    assert.equal(memberCallCount, 1);

    t.mock.timers.tick(1);
    await flushMicrotasks();

    const result = await resultPromise;

    assert.deepEqual(result, { roleIds: [GUILD_ID], isGuildOwner: false });
    assert.equal(memberCallCount, 2);
  });

  for (const [caseName, retryAfterHeader] of [
    ["missing", undefined],
    ["invalid (non-numeric)", "invalid"],
    ["negative", "-1"],
    ["empty string", ""],
    ["whitespace only", "   "]
  ] as const) {
    it(`falls back to a default 1s wait when Retry-After is ${caseName}`, async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      let memberCallCount = 0;
      mock.method(globalThis, "fetch", async (input: string | URL) => {
        const url = input.toString();
        if (url.includes("/members/")) {
          memberCallCount += 1;
          if (memberCallCount === 1) {
            return retryAfterHeader === undefined
              ? new Response(null, { status: 429 })
              : new Response(null, { status: 429, headers: { "Retry-After": retryAfterHeader } });
          }
          return jsonResponse(200, { roles: [] });
        }
        return jsonResponse(200, { owner_id: "someone-else" });
      });

      const resultPromise = fetchGuildMemberAccess({
        botToken: BOT_TOKEN,
        guildId: GUILD_ID,
        userId: USER_ID
      });
      await flushMicrotasks();
      t.mock.timers.tick(999);
      await flushMicrotasks();
      assert.equal(memberCallCount, 1);

      t.mock.timers.tick(1);
      await flushMicrotasks();

      const result = await resultPromise;

      assert.deepEqual(result, { roleIds: [GUILD_ID], isGuildOwner: false });
      assert.equal(memberCallCount, 2);
    });
  }

  it("caps an excessively large Retry-After so it doesn't block the request indefinitely", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let memberCallCount = 0;
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        memberCallCount += 1;
        if (memberCallCount === 1) {
          return new Response(null, { status: 429, headers: { "Retry-After": "600" } });
        }
        return jsonResponse(200, { roles: [] });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    const resultPromise = fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });
    await flushMicrotasks();
    t.mock.timers.tick(DISCORD_MAX_RETRY_AFTER_MS - 1);
    await flushMicrotasks();
    assert.equal(memberCallCount, 1);

    t.mock.timers.tick(1);
    await flushMicrotasks();

    const result = await resultPromise;

    assert.deepEqual(result, { roleIds: [GUILD_ID], isGuildOwner: false });
    assert.equal(memberCallCount, 2);
  });

  it("retries the guild lookup on 5xx with backoff and succeeds", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let guildCallCount = 0;
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(200, { roles: [] });
      }
      guildCallCount += 1;
      if (guildCallCount < 3) {
        return jsonResponse(502, { message: "Bad Gateway" });
      }
      return jsonResponse(200, { owner_id: USER_ID });
    });

    const resultPromise = fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });

    // 1回目の待機: 250ms(2^0 * 250ms)
    await flushMicrotasks();
    t.mock.timers.tick(249);
    await flushMicrotasks();
    assert.equal(guildCallCount, 1);
    t.mock.timers.tick(1);
    await flushMicrotasks();
    assert.equal(guildCallCount, 2);

    // 2回目の待機: 500ms(2^1 * 250ms)、単なる固定待機ではなく増加することを検証
    t.mock.timers.tick(499);
    await flushMicrotasks();
    assert.equal(guildCallCount, 2);
    t.mock.timers.tick(1);
    await flushMicrotasks();

    const result = await resultPromise;

    assert.deepEqual(result, { roleIds: [GUILD_ID], isGuildOwner: true });
    assert.equal(guildCallCount, 3);
  });

  it("gives up and throws DiscordApiError after exhausting retries on persistent 5xx", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let memberCallCount = 0;
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        memberCallCount += 1;
        return jsonResponse(503, { message: "Service Unavailable" });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    const resultPromise = fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });
    const assertionPromise = assert.rejects(
      () => resultPromise,
      (error: unknown) => error instanceof DiscordApiError && error.status === 503
    );

    for (let i = 0; i < MAX_DISCORD_FETCH_ATTEMPTS; i += 1) {
      await flushMicrotasks();
      t.mock.timers.tick(60_000);
    }

    await assertionPromise;
    assert.equal(memberCallCount, MAX_DISCORD_FETCH_ATTEMPTS);
  });

  it("throws DiscordUnknownGuildError when the member lookup responds 404 with code 10004 (Unknown Guild)", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(404, { message: "Unknown Guild", code: 10004 });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    await assert.rejects(
      () => fetchGuildMemberAccess({ botToken: BOT_TOKEN, guildId: GUILD_ID, userId: USER_ID }),
      (error: unknown) =>
        error instanceof DiscordUnknownGuildError &&
        error.status === 404 &&
        error.message === `Unknown Discord guild (${GUILD_ID}).`
    );
  });

  it("throws a plain DiscordApiError (not DiscordUnknownGuildError) and logs when the member lookup responds 404 with an unrecognized code", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(404, { message: "Something Else", code: 99999 });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });
    const consoleErrorMock = mock.method(console, "error", () => {});

    await assert.rejects(
      () => fetchGuildMemberAccess({ botToken: BOT_TOKEN, guildId: GUILD_ID, userId: USER_ID }),
      (error: unknown) =>
        error instanceof DiscordApiError &&
        !(error instanceof DiscordUnknownGuildError) &&
        error.status === 404 &&
        error.message === "Unexpected 404 from Discord guild member lookup (code: 99999)."
    );
    assert.equal(consoleErrorMock.mock.callCount(), 1);
  });

  it("throws a plain DiscordApiError (not DiscordUnknownGuildError) and logs when the member lookup responds 404 with a malformed (non-JSON) body", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return new Response("not json", { status: 404 });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });
    const consoleErrorMock = mock.method(console, "error", () => {});

    await assert.rejects(
      () => fetchGuildMemberAccess({ botToken: BOT_TOKEN, guildId: GUILD_ID, userId: USER_ID }),
      (error: unknown) =>
        error instanceof DiscordApiError &&
        !(error instanceof DiscordUnknownGuildError) &&
        error.status === 404 &&
        error.message === "Unexpected 404 from Discord guild member lookup (code: unknown)."
    );
    assert.equal(consoleErrorMock.mock.callCount(), 1);
  });

  it("does not retry on 404 (member left the guild)", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let memberCallCount = 0;
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        memberCallCount += 1;
        return jsonResponse(404, { message: "Unknown Member", code: 10007 });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    const result = await fetchGuildMemberAccess({
      botToken: BOT_TOKEN,
      guildId: GUILD_ID,
      userId: USER_ID
    });

    assert.equal(result, null);
    assert.equal(memberCallCount, 1);
  });
});

describe("fetchGuildInfo", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns the guild id and name", async () => {
    mock.method(globalThis, "fetch", async () =>
      jsonResponse(200, { id: GUILD_ID, name: "My Guild" })
    );

    const result = await fetchGuildInfo(BOT_TOKEN, GUILD_ID);

    assert.deepEqual(result, { id: GUILD_ID, name: "My Guild" });
  });

  it("throws a DiscordApiError when the guild lookup fails with a non-404 error", async () => {
    mock.method(globalThis, "fetch", async () => jsonResponse(500, { message: "Internal Server Error" }));

    await assert.rejects(
      () => fetchGuildInfo(BOT_TOKEN, GUILD_ID),
      (error: unknown) => error instanceof DiscordApiError && error.status === 500
    );
  });

  it("throws DiscordUnknownGuildError when the guild lookup responds 404 with code 10004 (Unknown Guild)", async () => {
    mock.method(globalThis, "fetch", async () =>
      jsonResponse(404, { message: "Unknown Guild", code: 10004 })
    );

    await assert.rejects(
      () => fetchGuildInfo(BOT_TOKEN, GUILD_ID),
      (error: unknown) =>
        error instanceof DiscordUnknownGuildError &&
        error.status === 404 &&
        error.message === `Unknown Discord guild (${GUILD_ID}).`
    );
  });

  it("throws a plain DiscordApiError (not DiscordUnknownGuildError) and logs when the guild lookup responds 404 with an unrecognized code", async () => {
    mock.method(globalThis, "fetch", async () =>
      jsonResponse(404, { message: "Something Else", code: 99999 })
    );
    const consoleErrorMock = mock.method(console, "error", () => {});

    await assert.rejects(
      () => fetchGuildInfo(BOT_TOKEN, GUILD_ID),
      (error: unknown) =>
        error instanceof DiscordApiError &&
        !(error instanceof DiscordUnknownGuildError) &&
        error.status === 404 &&
        error.message === "Unexpected 404 from Discord guild lookup (code: 99999)."
    );
    assert.equal(consoleErrorMock.mock.callCount(), 1);
  });

  it("throws a plain DiscordApiError (not DiscordUnknownGuildError) and logs when the guild lookup responds 404 with a malformed (non-JSON) body", async () => {
    mock.method(globalThis, "fetch", async () => new Response("not json", { status: 404 }));
    const consoleErrorMock = mock.method(console, "error", () => {});

    await assert.rejects(
      () => fetchGuildInfo(BOT_TOKEN, GUILD_ID),
      (error: unknown) =>
        error instanceof DiscordApiError &&
        !(error instanceof DiscordUnknownGuildError) &&
        error.status === 404 &&
        error.message === "Unexpected 404 from Discord guild lookup (code: unknown)."
    );
    assert.equal(consoleErrorMock.mock.callCount(), 1);
  });
});
