import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createIntegrationLogHandlers } from "./integration-log-handlers.js";

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createIntegrationLogHandlers", () => {
  it("writes integration.update on onIntegrationsUpdate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createIntegrationLogHandlers({ writeLogEvent });

    await handlers.onIntegrationsUpdate({ id: "guild-1" } as never);

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "integration.update");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createIntegrationLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onIntegrationsUpdate({ id: "guild-1" } as never));
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
