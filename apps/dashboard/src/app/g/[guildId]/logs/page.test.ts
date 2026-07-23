import { describe, expect, test } from "bun:test";

import { deriveLogsPageState, type LogsQueryResult } from "./page";

const ENTRY = {
  id: "log-1",
  eventName: "member.join",
  actorId: null,
  channelId: null,
  messageId: null,
  eventTimestamp: "2026-01-01T00:00:00.000Z",
  receivedAt: "2026-01-01T00:00:00.000Z",
  payload: null
};

describe("deriveLogsPageState", () => {
  test("returns loading while the initial fetch is in flight (no data, no error)", () => {
    const query: LogsQueryResult = {
      data: undefined,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false
    };

    expect(deriveLogsPageState(query)).toEqual({ kind: "loading" });
  });

  test("returns error when the initial fetch fails (no data yet)", () => {
    const query: LogsQueryResult = {
      data: undefined,
      error: { message: "boom" },
      hasNextPage: false,
      isFetchingNextPage: false
    };

    expect(deriveLogsPageState(query)).toEqual({ kind: "error", message: "boom" });
  });

  test("returns loaded with entries from all pages once data has arrived", () => {
    const query: LogsQueryResult = {
      data: { pages: [{ items: [ENTRY] }, { items: [{ ...ENTRY, id: "log-2" }] }] },
      error: null,
      hasNextPage: true,
      isFetchingNextPage: false
    };

    expect(deriveLogsPageState(query)).toEqual({
      kind: "loaded",
      entries: [ENTRY, { ...ENTRY, id: "log-2" }],
      hasNextPage: true,
      isFetchingNextPage: false
    });
  });

  test("keeps loaded (not error) when a later page fetch fails after data already loaded", () => {
    const query: LogsQueryResult = {
      data: { pages: [{ items: [ENTRY] }] },
      error: { message: "network error on fetchNextPage" },
      hasNextPage: true,
      isFetchingNextPage: false
    };

    expect(deriveLogsPageState(query)).toEqual({
      kind: "loaded",
      entries: [ENTRY],
      hasNextPage: true,
      isFetchingNextPage: false
    });
  });
});
