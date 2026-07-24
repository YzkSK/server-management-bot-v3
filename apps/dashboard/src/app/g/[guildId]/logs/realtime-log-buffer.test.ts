import { describe, expect, test } from "bun:test";

import type { LogEntryData } from "./logs-view";
import {
  applyIncomingRealtimeLogs,
  createInitialRealtimeLogBufferState,
  setRealtimeLogsPaused
} from "./realtime-log-buffer";

function entry(id: string): LogEntryData {
  return {
    id,
    eventName: "member.join",
    actorId: null,
    channelId: null,
    messageId: null,
    eventTimestamp: "2026-01-01T00:00:00.000Z",
    receivedAt: "2026-01-01T00:00:00.000Z",
    payload: null
  };
}

describe("realtime-log-buffer", () => {
  test("starts empty and not paused", () => {
    expect(createInitialRealtimeLogBufferState()).toEqual({
      displayed: [],
      pending: [],
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
    const state = { displayed: many, pending: [], paused: false };

    const next = applyIncomingRealtimeLogs(state, [entry("new-1")]);

    expect(next.displayed.length).toBe(200);
    expect(next.displayed[0]).toEqual(entry("new-1"));
  });

  test("does not cap pending, so the new-entries count stays accurate past 200 while paused", () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`old-${i}`));
    const state = setRealtimeLogsPaused(
      { displayed: [], pending: many, paused: false },
      true
    );

    const next = applyIncomingRealtimeLogs(state, [entry("new-1")]);

    expect(next.pending.length).toBe(201);
  });

  test("resuming (paused -> false) flushes pending into displayed and clears pending", () => {
    const paused = setRealtimeLogsPaused(createInitialRealtimeLogBufferState(), true);
    const withPending = applyIncomingRealtimeLogs(paused, [entry("2"), entry("1")]);

    const resumed = setRealtimeLogsPaused(withPending, false);

    expect(resumed.paused).toBe(false);
    expect(resumed.displayed).toEqual([entry("2"), entry("1")]);
    expect(resumed.pending).toEqual([]);
  });

  test("pausing (false -> true) is a no-op besides flipping the flag", () => {
    const state = createInitialRealtimeLogBufferState();
    const paused = setRealtimeLogsPaused(state, true);

    expect(paused).toEqual({ displayed: [], pending: [], paused: true });
  });
});
