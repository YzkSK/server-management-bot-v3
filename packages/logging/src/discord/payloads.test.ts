import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  channelPayload,
  channelPermissionOverwritesPayload,
  diffRecord,
  guildPayload,
  memberPayload,
  rolePayload,
  userPayload
} from "./payloads.js";

describe("diffRecord", () => {
  it("returns an empty object when before/after are identical", () => {
    assert.deepEqual(diffRecord({ a: 1, b: "x" }, { a: 1, b: "x" }), {});
  });

  it("returns changed keys only, with before/after values", () => {
    const changes = diffRecord({ a: 1, b: "x" }, { a: 2, b: "x" });
    assert.deepEqual(changes, { a: { before: 1, after: 2 } });
  });

  it("detects keys added or removed between before/after", () => {
    const changes = diffRecord({ a: 1 }, { a: 1, b: "new" });
    assert.deepEqual(changes, { b: { before: undefined, after: "new" } });
  });
});

describe("guildPayload", () => {
  it("extracts the tracked guild fields", () => {
    const guild = {
      id: "guild-1",
      name: "My Guild",
      description: null,
      ownerId: "owner-1",
      preferredLocale: "ja",
      verificationLevel: 1,
      premiumTier: 0
    } as never;

    assert.deepEqual(guildPayload(guild), {
      id: "guild-1",
      name: "My Guild",
      description: null,
      ownerId: "owner-1",
      preferredLocale: "ja",
      verificationLevel: 1,
      premiumTier: 0
    });
  });
});

describe("userPayload", () => {
  it("extracts the tracked user fields", () => {
    const user = { id: "user-1", username: "alice", globalName: "Alice", bot: false } as never;

    assert.deepEqual(userPayload(user), {
      id: "user-1",
      username: "alice",
      globalName: "Alice",
      bot: false
    });
  });
});

function fakeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    guild: { id: "guild-1" },
    displayName: "Display",
    nickname: null,
    user: { id: "member-1", username: "member1", globalName: null, bot: false },
    roles: { cache: new Map([["role-1", {}]]) },
    pending: false,
    communicationDisabledUntil: null,
    ...overrides
  } as never;
}

describe("memberPayload", () => {
  it("extracts member fields including role ids and nested user payload", () => {
    const payload = memberPayload(fakeMember());

    assert.deepEqual(payload, {
      id: "member-1",
      displayName: "Display",
      nickname: null,
      user: { id: "member-1", username: "member1", globalName: null, bot: false },
      roles: ["role-1"],
      pending: false,
      communicationDisabledUntil: null
    });
  });

  it("formats communicationDisabledUntil as an ISO string when present", () => {
    const payload = memberPayload(
      fakeMember({ communicationDisabledUntil: new Date("2026-07-19T00:00:00.000Z") })
    );

    assert.equal(payload.communicationDisabledUntil, "2026-07-19T00:00:00.000Z");
  });

  it("returns null user when user is missing", () => {
    const payload = memberPayload(fakeMember({ user: null }));

    assert.equal(payload.user, null);
  });
});

describe("rolePayload", () => {
  it("extracts the tracked role fields", () => {
    const role = {
      id: "role-1",
      name: "Admin",
      color: 16711680,
      hoist: true,
      position: 5,
      managed: false,
      mentionable: true,
      permissions: { bitfield: 8n }
    } as never;

    assert.deepEqual(rolePayload(role), {
      id: "role-1",
      name: "Admin",
      color: 16711680,
      hoist: true,
      position: 5,
      managed: false,
      mentionable: true,
      permissions: "8"
    });
  });
});

function fakeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "channel-1",
    guildId: "guild-1",
    name: "general",
    type: 0,
    parentId: null,
    position: 0,
    rateLimitPerUser: 0,
    permissionOverwrites: { cache: new Map() },
    ...overrides
  } as never;
}

describe("channelPermissionOverwritesPayload", () => {
  it("maps overwrites and sorts them by id", () => {
    const overwrites = new Map([
      ["role-2", { id: "role-2", type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } }],
      ["role-1", { id: "role-1", type: 0, allow: { bitfield: 0n }, deny: { bitfield: 2n } }]
    ]);

    const payload = channelPermissionOverwritesPayload(
      fakeChannel({ permissionOverwrites: { cache: overwrites } })
    );

    assert.deepEqual(payload, [
      { id: "role-1", type: 0, allow: "0", deny: "2" },
      { id: "role-2", type: 0, allow: "1", deny: "0" }
    ]);
  });
});

describe("channelPayload", () => {
  it("extracts the tracked channel fields including permission overwrites", () => {
    const payload = channelPayload(fakeChannel());

    assert.deepEqual(payload, {
      id: "channel-1",
      guildId: "guild-1",
      name: "general",
      type: 0,
      parentId: null,
      position: 0,
      rateLimitPerUser: 0,
      permissionOverwrites: []
    });
  });

  it("returns null rateLimitPerUser when the channel type does not support it", () => {
    const { rateLimitPerUser: _rateLimitPerUser, ...withoutRateLimit } = fakeChannel();
    const payload = channelPayload(withoutRateLimit as never);

    assert.equal(payload.rateLimitPerUser, null);
  });
});
