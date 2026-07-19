import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeMemberJoin, normalizeMemberLeave, normalizeMemberUpdate } from "./member-events.js";

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

describe("normalizeMemberJoin", () => {
  it("normalizes a member join with actorId set to the member itself", () => {
    const event = normalizeMemberJoin(fakeMember());

    assert.equal(event.eventName, "member.join");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, "member-1");
    assert.equal(event.channelId, null);
    assert.deepEqual((event.payload.member as { id: string }).id, "member-1");
  });
});

describe("normalizeMemberLeave", () => {
  it("normalizes a member leave with actorId set to the member itself", () => {
    const event = normalizeMemberLeave(fakeMember());

    assert.equal(event.eventName, "member.leave");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, "member-1");
  });

  it("accepts a partial member (missing joinedAt/pending)", () => {
    const event = normalizeMemberLeave(fakeMember({ pending: undefined }));

    assert.equal(event.eventName, "member.leave");
  });
});

describe("normalizeMemberUpdate", () => {
  it("returns null when nothing tracked changed", () => {
    const event = normalizeMemberUpdate(fakeMember(), fakeMember());

    assert.equal(event, null);
  });

  it("normalizes an update when the nickname changed", () => {
    const event = normalizeMemberUpdate(
      fakeMember({ nickname: null }),
      fakeMember({ nickname: "New Nick" })
    );

    assert.ok(event);
    assert.equal(event?.eventName, "member.update");
    assert.equal(event?.actorId, "member-1");
    assert.deepEqual(event?.payload.changes, {
      nickname: { before: null, after: "New Nick" }
    });
  });

  it("normalizes an update when roles changed", () => {
    const event = normalizeMemberUpdate(
      fakeMember({ roles: { cache: new Map([["role-1", {}]]) } }),
      fakeMember({ roles: { cache: new Map([["role-1", {}], ["role-2", {}]]) } })
    );

    assert.ok(event);
    assert.deepEqual((event?.payload.after as { roles: string[] }).roles, ["role-1", "role-2"]);
  });

  it("does not treat role cache order as a member role change", () => {
    const event = normalizeMemberUpdate(
      fakeMember({ roles: { cache: new Map([["role-1", {}], ["role-2", {}]]) } }),
      fakeMember({ roles: { cache: new Map([["role-2", {}], ["role-1", {}]]) } })
    );

    assert.equal(event, null);
  });
});
