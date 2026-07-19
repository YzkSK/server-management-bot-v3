import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeIntegrationUpdate } from "./integration-events.js";

describe("normalizeIntegrationUpdate", () => {
  it("normalizes with an empty payload and no actor", () => {
    const event = normalizeIntegrationUpdate({ id: "guild-1" } as never);

    assert.equal(event.eventName, "integration.update");
    assert.equal(event.guildId, "guild-1");
    assert.equal(event.actorId, null);
    assert.deepEqual(event.payload, {});
  });
});
