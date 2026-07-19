import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeInviteCreate, normalizeInviteDelete } from "./invite-events.js";

function fakeInvite(overrides: Record<string, unknown> = {}) {
  return {
    code: "abc123",
    url: "https://discord.gg/abc123",
    maxAge: 86400,
    maxUses: 10,
    temporary: false,
    uses: 0,
    guild: { id: "guild-1" },
    channel: { id: "channel-1" },
    inviter: { id: "member-1", username: "member1", globalName: null, bot: false },
    ...overrides
  } as never;
}

describe("normalizeInviteCreate", () => {
  it("normalizes an invite create with the inviter as actor", () => {
    const event = normalizeInviteCreate(fakeInvite());

    assert.equal(event.eventName, "invite.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.channelId, "channel-1");
    assert.equal(event.actorId, "member-1");
    assert.deepEqual((event.payload.invite as { code: string }).code, "abc123");
  });

  it("uses null actor when there is no inviter", () => {
    const event = normalizeInviteCreate(fakeInvite({ inviter: null }));

    assert.equal(event.actorId, null);
    assert.equal(event.payload.inviter, null);
  });
});

describe("normalizeInviteDelete", () => {
  it("does not attribute invite.delete to the invite creator", () => {
    const cached = {
      code: "abc123",
      url: "https://discord.gg/abc123",
      maxAge: 86400,
      maxUses: 10,
      temporary: false,
      uses: 0,
      inviterId: "member-1"
    };

    const event = normalizeInviteDelete(fakeInvite({ inviter: null }), cached);

    assert.equal(event.eventName, "invite.delete");
    assert.equal(event.actorId, null);
  });

  it("falls back to cached invite fields for the payload when the invite has no inviter", () => {
    const cached = {
      code: "abc123",
      url: "https://discord.gg/abc123",
      maxAge: 86400,
      maxUses: 10,
      temporary: false,
      uses: 0,
      inviterId: "member-1"
    };

    const event = normalizeInviteDelete(fakeInvite({ inviter: null, maxAge: null }), cached);

    assert.equal((event.payload.invite as { maxAge: number }).maxAge, 86400);
  });
});
