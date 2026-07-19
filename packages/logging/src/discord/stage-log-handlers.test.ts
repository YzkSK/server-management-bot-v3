import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createStageLogHandlers } from "./stage-log-handlers.js";

function fakeStage(overrides: Record<string, unknown> = {}) {
  return {
    id: "stage-1",
    guildId: "guild-1",
    channelId: "channel-1",
    topic: "town hall",
    privacyLevel: 2,
    discoverableDisabled: false,
    ...overrides
  } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createStageLogHandlers", () => {
  it("writes stage.create on onStageCreate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createStageLogHandlers({ writeLogEvent });

    await handlers.onStageCreate(fakeStage());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "stage.create");
  });

  it("writes stage.update on onStageUpdate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createStageLogHandlers({ writeLogEvent });

    await handlers.onStageUpdate(fakeStage(), fakeStage({ topic: "changed" }));

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "stage.update");
  });

  it("writes stage.delete on onStageDelete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createStageLogHandlers({ writeLogEvent });

    await handlers.onStageDelete(fakeStage());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "stage.delete");
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createStageLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onStageCreate(fakeStage()));
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mock.restore();
    }
  });
});
