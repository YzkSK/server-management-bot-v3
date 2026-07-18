import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizedEventSchema } from "./logs.js";

describe("normalizedEventSchema", () => {
  const base = {
    eventTimestamp: new Date("2026-07-18T00:00:00.000Z"),
    receivedAt: new Date("2026-07-18T00:00:01.000Z"),
    eventName: "member.join",
    guildId: "guild-1",
    actorId: "user-1",
    channelId: null,
    messageId: null,
    payload: { displayName: "test" }
  };

  it("parses a fully populated event", () => {
    const parsed = normalizedEventSchema.parse(base);
    assert.equal(parsed.eventName, "member.join");
    assert.equal(parsed.guildId, "guild-1");
  });

  it("accepts null for guildId, actorId, channelId, messageId (system-level events)", () => {
    const parsed = normalizedEventSchema.parse({
      ...base,
      guildId: null,
      actorId: null,
      channelId: null,
      messageId: null
    });
    assert.equal(parsed.guildId, null);
  });

  it("coerces string dates into Date instances", () => {
    const parsed = normalizedEventSchema.parse({
      ...base,
      eventTimestamp: "2026-07-18T00:00:00.000Z",
      receivedAt: "2026-07-18T00:00:01.000Z"
    });
    assert.ok(parsed.eventTimestamp instanceof Date);
  });

  it("rejects an empty eventName", () => {
    assert.throws(() => normalizedEventSchema.parse({ ...base, eventName: "" }));
  });

  it("rejects a missing payload", () => {
    const { payload: _payload, ...withoutPayload } = base;
    assert.throws(() => normalizedEventSchema.parse(withoutPayload));
  });

  it("rejects an eventName longer than 128 characters", () => {
    assert.throws(() =>
      normalizedEventSchema.parse({ ...base, eventName: "a".repeat(129) })
    );
  });

  for (const field of ["eventTimestamp", "receivedAt"] as const) {
    it(`rejects null for ${field}`, () => {
      assert.throws(() =>
        normalizedEventSchema.parse({ ...base, [field]: null })
      );
    });

    it(`rejects 0 for ${field}`, () => {
      assert.throws(() => normalizedEventSchema.parse({ ...base, [field]: 0 }));
    });

    it(`rejects a malformed date string for ${field}`, () => {
      assert.throws(() =>
        normalizedEventSchema.parse({ ...base, [field]: "not-a-date" })
      );
    });
  }
});
