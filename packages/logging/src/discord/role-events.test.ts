import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeRoleCreate, normalizeRoleDelete, normalizeRoleUpdate } from "./role-events.js";

function fakeRole(overrides: Record<string, unknown> = {}) {
  return {
    id: "role-1",
    guild: { id: "guild-1" },
    name: "Admin",
    color: 0,
    hoist: false,
    position: 1,
    managed: false,
    mentionable: false,
    permissions: { bitfield: 0n },
    ...overrides
  } as never;
}

describe("normalizeRoleCreate", () => {
  it("normalizes a role create with no known actor", () => {
    const event = normalizeRoleCreate(fakeRole());

    assert.equal(event.eventName, "role.create");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, null);
    assert.deepEqual((event.payload.role as { id: string }).id, "role-1");
  });
});

describe("normalizeRoleDelete", () => {
  it("normalizes a role delete", () => {
    const event = normalizeRoleDelete(fakeRole());

    assert.equal(event.eventName, "role.delete");
    assert.equal(event.guildId, "guild-1");
  });
});

describe("normalizeRoleUpdate", () => {
  it("returns null when nothing tracked changed", () => {
    const event = normalizeRoleUpdate(fakeRole(), fakeRole());

    assert.equal(event, null);
  });

  it("normalizes an update when the name changed", () => {
    const event = normalizeRoleUpdate(fakeRole({ name: "Old" }), fakeRole({ name: "New" }));

    assert.ok(event);
    assert.equal(event?.eventName, "role.update");
    assert.deepEqual(event?.payload.changes, { name: { before: "Old", after: "New" } });
  });

  it("normalizes an update when permissions changed", () => {
    const event = normalizeRoleUpdate(
      fakeRole({ permissions: { bitfield: 0n } }),
      fakeRole({ permissions: { bitfield: 8n } })
    );

    assert.ok(event);
    assert.deepEqual(event?.payload.changes, {
      permissions: { before: "0", after: "8" }
    });
  });
});
