import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import { createMemberLogHandlers } from "./member-log-handlers.js";

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

function fakeWriteLogEvent() {
  return mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => undefined);
}

describe("createMemberLogHandlers", () => {
  it("writes member.join on onGuildMemberAdd", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });

    await handlers.onGuildMemberAdd(fakeMember());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "member.join");
  });

  it("writes member.leave on onGuildMemberRemove", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });

    await handlers.onGuildMemberRemove(fakeMember());

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "member.leave");
  });

  it("writes member.update when tracked fields changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });

    await handlers.onGuildMemberUpdate(
      fakeMember({ nickname: null }),
      fakeMember({ nickname: "New" })
    );

    assert.equal(writeLogEvent.mock.calls.length, 1);
    assert.equal(writeLogEvent.mock.calls[0]?.arguments[0].eventName, "member.update");
  });

  it("skips member.update when nothing tracked changed", async () => {
    const writeLogEvent = fakeWriteLogEvent();
    const handlers = createMemberLogHandlers({ writeLogEvent });

    await handlers.onGuildMemberUpdate(fakeMember(), fakeMember());

    assert.equal(writeLogEvent.mock.calls.length, 0);
  });

  it("logs and swallows errors from writeLogEvent without throwing", async () => {
    const writeLogEvent = mock.fn<(event: NormalizedEvent) => Promise<void>>(async () => {
      throw new Error("db down");
    });
    const handlers = createMemberLogHandlers({ writeLogEvent });
    const consoleError = mock.method(console, "error", () => undefined);

    try {
      await assert.doesNotReject(handlers.onGuildMemberAdd(fakeMember()));

      assert.equal(consoleError.mock.calls.length, 1);
      const [, context] = consoleError.mock.calls[0]?.arguments ?? [];
      assert.equal((context as { eventName?: string }).eventName, "member.join");
      assert.equal((context as { guildId?: string }).guildId, "guild-1");
    } finally {
      consoleError.mock.restore();
    }
  });
});
