import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { DiscordApiError, fetchGuildMemberAccess } from "./discord-guild-member-client.js";

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
        return jsonResponse(404, { message: "Unknown Member" });
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

  it("throws DiscordApiError when the member lookup fails with a non-404 error", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/members/")) {
        return jsonResponse(500, { message: "Internal Server Error" });
      }
      return jsonResponse(200, { owner_id: "someone-else" });
    });

    await assert.rejects(
      () => fetchGuildMemberAccess({ botToken: BOT_TOKEN, guildId: GUILD_ID, userId: USER_ID }),
      (error: unknown) => error instanceof DiscordApiError && error.status === 500
    );
  });

  it("throws DiscordApiError when the guild owner lookup fails", async () => {
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
});
