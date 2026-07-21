import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isGuildChannel,
  normalizeChannelCreate,
  normalizeChannelDelete,
  normalizeChannelUpdate,
  normalizeWebhookChange
} from "./channel-events.js";

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

describe("isGuildChannel", () => {
  it("returns true for a guild channel (has guildId)", () => {
    assert.equal(isGuildChannel(fakeChannel()), true);
  });

  it("returns false for a DM channel (no guildId)", () => {
    assert.equal(isGuildChannel({ id: "dm-1" } as never), false);
  });
});

describe("normalizeChannelCreate", () => {
  it("normalizes a channel create with no known actor", () => {
    const event = normalizeChannelCreate(fakeChannel());

    assert.equal(event.eventName, "channel.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.channelId, "channel-1");
    assert.equal(event.actorId, null);
  });
});

describe("normalizeChannelDelete", () => {
  it("normalizes a channel delete", () => {
    const event = normalizeChannelDelete(fakeChannel());

    assert.equal(event.eventName, "channel.delete");
    assert.equal(event.channelId, "channel-1");
  });
});

describe("normalizeChannelUpdate", () => {
  it("returns an empty array when nothing changed", () => {
    const events = normalizeChannelUpdate(fakeChannel(), fakeChannel());

    assert.deepEqual(events, []);
  });

  it("returns only channel.update when a non-overwrite property changed", () => {
    const events = normalizeChannelUpdate(
      fakeChannel({ name: "old-name" }),
      fakeChannel({ name: "new-name" })
    );

    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventName, "channel.update");
    assert.deepEqual(events[0]?.payload.changes, {
      name: { before: "old-name", after: "new-name" }
    });
  });

  it("returns only channel.permission_update when only overwrites changed", () => {
    const before = fakeChannel({ permissionOverwrites: { cache: new Map() } });
    const after = fakeChannel({
      permissionOverwrites: {
        cache: new Map([
          ["role-1", { id: "role-1", type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } }]
        ])
      }
    });

    const events = normalizeChannelUpdate(before, after);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventName, "channel.permission_update");
  });

  it("returns both events when a property and overwrites both changed", () => {
    const before = fakeChannel({ name: "old-name", permissionOverwrites: { cache: new Map() } });
    const after = fakeChannel({
      name: "new-name",
      permissionOverwrites: {
        cache: new Map([
          ["role-1", { id: "role-1", type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } }]
        ])
      }
    });

    const events = normalizeChannelUpdate(before, after);

    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((event) => event.eventName).sort(),
      ["channel.permission_update", "channel.update"]
    );
  });
});

describe("normalizeWebhookChange", () => {
  it("normalizes a webhook update with no known actor", () => {
    const event = normalizeWebhookChange(fakeChannel(), "webhook.update");

    assert.equal(event.eventName, "webhook.update");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.channelId, "channel-1");
    assert.equal(event.actorId, null);
  });

  it("normalizes with the given eventName (create/delete)", () => {
    assert.equal(normalizeWebhookChange(fakeChannel(), "webhook.create").eventName, "webhook.create");
    assert.equal(normalizeWebhookChange(fakeChannel(), "webhook.delete").eventName, "webhook.delete");
  });
});
