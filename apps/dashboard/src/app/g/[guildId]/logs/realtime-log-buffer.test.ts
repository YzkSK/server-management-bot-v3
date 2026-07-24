import { describe, expect, test } from "bun:test";

import type { LogEntryData } from "./logs-view";
import {
  applyIncomingRealtimeLogs,
  createInitialRealtimeLogBufferState,
  setRealtimeLogsPaused,
  type PendingCountByCategory
} from "./realtime-log-buffer";

function entry(id: string, eventName = "member.join"): LogEntryData {
  return {
    id,
    eventName,
    actorId: null,
    channelId: null,
    messageId: null,
    eventTimestamp: "2026-01-01T00:00:00.000Z",
    receivedAt: "2026-01-01T00:00:00.000Z",
    payload: null
  };
}

const ZERO_COUNTS: PendingCountByCategory = {
  all: 0,
  message: 0,
  member: 0,
  audit: 0,
  voice: 0,
  temp_vc: 0,
  recruitment: 0,
  tts: 0,
  system: 0,
  dashboard: 0
};

describe("realtime-log-buffer", () => {
  test("starts empty and not paused", () => {
    expect(createInitialRealtimeLogBufferState()).toEqual({
      displayed: [],
      pending: [],
      pendingCountByCategory: ZERO_COUNTS,
      paused: false
    });
  });

  test("prepends incoming logs directly to displayed when not paused", () => {
    const state = createInitialRealtimeLogBufferState();
    const next = applyIncomingRealtimeLogs(state, [entry("1")]);

    expect(next.displayed).toEqual([entry("1")]);
    expect(next.pending).toEqual([]);
  });

  test("buffers incoming logs into pending when paused, without touching displayed", () => {
    const paused = setRealtimeLogsPaused(createInitialRealtimeLogBufferState(), true);
    const next = applyIncomingRealtimeLogs(paused, [entry("1")]);

    expect(next.displayed).toEqual([]);
    expect(next.pending).toEqual([entry("1")]);
    expect(next.paused).toBe(true);
  });

  test("dedupes by id, keeping the newest occurrence first", () => {
    const state = createInitialRealtimeLogBufferState();
    const withFirst = applyIncomingRealtimeLogs(state, [entry("1")]);
    const withDuplicate = applyIncomingRealtimeLogs(withFirst, [entry("1")]);

    expect(withDuplicate.displayed).toEqual([entry("1")]);
  });

  test("caps displayed at 200 entries", () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`old-${i}`));
    const state = {
      displayed: many,
      pending: [],
      pendingCountByCategory: ZERO_COUNTS,
      paused: false
    };

    const next = applyIncomingRealtimeLogs(state, [entry("new-1")]);

    expect(next.displayed.length).toBe(200);
    expect(next.displayed[0]).toEqual(entry("new-1"));
  });

  test("caps pending at 200 entries while paused, so memory stays bounded", () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`old-${i}`));
    const state = setRealtimeLogsPaused(
      { displayed: [], pending: many, pendingCountByCategory: ZERO_COUNTS, paused: false },
      true
    );

    const next = applyIncomingRealtimeLogs(state, [entry("new-1")]);

    expect(next.pending.length).toBe(200);
    expect(next.pending[0]).toEqual(entry("new-1"));
  });

  test("increments pendingCountByCategory.all and the matching category while paused, past the 200 pending cap", () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`old-${i}`, "member.join"));
    const state = setRealtimeLogsPaused(
      {
        displayed: [],
        pending: many,
        pendingCountByCategory: { ...ZERO_COUNTS, all: 200, member: 200 },
        paused: false
      },
      true
    );

    const next = applyIncomingRealtimeLogs(state, [entry("new-1", "message.create")]);

    expect(next.pendingCountByCategory.all).toBe(201);
    expect(next.pendingCountByCategory.message).toBe(1);
    expect(next.pendingCountByCategory.member).toBe(200);
  });

  test("does not double-count a duplicate id received twice while paused", () => {
    const paused = setRealtimeLogsPaused(createInitialRealtimeLogBufferState(), true);
    const withFirst = applyIncomingRealtimeLogs(paused, [entry("1", "member.join")]);
    const withDuplicate = applyIncomingRealtimeLogs(withFirst, [entry("1", "member.join")]);

    expect(withDuplicate.pendingCountByCategory.all).toBe(1);
    expect(withDuplicate.pendingCountByCategory.member).toBe(1);
  });

  test("resuming (paused -> false) flushes pending into displayed, clears pending, and resets counts", () => {
    const paused = setRealtimeLogsPaused(createInitialRealtimeLogBufferState(), true);
    const withPending = applyIncomingRealtimeLogs(paused, [entry("2"), entry("1")]);

    const resumed = setRealtimeLogsPaused(withPending, false);

    expect(resumed.paused).toBe(false);
    expect(resumed.displayed).toEqual([entry("2"), entry("1")]);
    expect(resumed.pending).toEqual([]);
    expect(resumed.pendingCountByCategory).toEqual(ZERO_COUNTS);
  });

  test("pausing (false -> true) is a no-op besides flipping the flag", () => {
    const state = createInitialRealtimeLogBufferState();
    const paused = setRealtimeLogsPaused(state, true);

    expect(paused).toEqual({
      displayed: [],
      pending: [],
      pendingCountByCategory: ZERO_COUNTS,
      paused: true
    });
  });
});
