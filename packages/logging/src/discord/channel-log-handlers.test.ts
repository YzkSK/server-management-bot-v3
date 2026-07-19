import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createChannelLogHandlers } from "./channel-log-handlers.js";

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

function fakeDmChannel() {
  return { id: "dm-1" } as never;
}

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createChannelLogHandlers", () => {
  it("writes channel.create on onChannelCreate", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelCreate(fakeChannel());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "channel.create");
  });

  it("writes channel.delete on onChannelDelete", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelDelete(fakeChannel());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "channel.delete");
  });

  it("skips onChannelDelete for a DM channel", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelDelete(fakeDmChannel());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("writes both channel.update and channel.permission_update when both changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelUpdate(
      fakeChannel({ name: "old", permissionOverwrites: { cache: new Map() } }),
      fakeChannel({
        name: "new",
        permissionOverwrites: {
          cache: new Map([
            ["role-1", { id: "role-1", type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } }]
          ])
        }
      })
    );

    assert.equal(writeLogEvent.mock.calls.length, 2);
  });

  it("skips onChannelUpdate for DM channels", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createChannelLogHandlers({ writeLogEvent });

    await handlers.onChannelUpdate(fakeDmChannel(), fakeDmChannel());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createChannelLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onChannelCreate(fakeChannel()));

      assert.equal(consoleError.mock.calls.length, 1);
      const [, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal((context as { eventName?: string }).eventName, "channel.create");
    } finally {
      consoleError.mock.restore();
    }
  });
});
