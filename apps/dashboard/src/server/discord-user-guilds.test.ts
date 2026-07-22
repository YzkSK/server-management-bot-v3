import { afterEach, describe, expect, test } from "bun:test";
import { DiscordApiError } from "@sm-bot/dashboard-access";

import { fetchCurrentUserDiscordGuilds } from "./discord-user-guilds";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchCurrentUserDiscordGuilds", () => {
  test("returns id/name/owner for each guild the user belongs to", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          { id: "guild-1", name: "Guild One", owner: true },
          { id: "guild-2", name: "Guild Two", owner: false }
        ]),
        { status: 200 }
      )) as typeof fetch;

    const result = await fetchCurrentUserDiscordGuilds("token-abc");

    expect(result).toEqual([
      { id: "guild-1", name: "Guild One", owner: true },
      { id: "guild-2", name: "Guild Two", owner: false }
    ]);
  });

  test("throws DiscordApiError with status 401 when the token is invalid", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "401: Unauthorized" }), { status: 401 })) as typeof fetch;

    await expect(fetchCurrentUserDiscordGuilds("bad-token")).rejects.toThrow(DiscordApiError);
  });
});
