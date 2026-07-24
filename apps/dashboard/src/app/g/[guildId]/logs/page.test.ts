import { describe, expect, test } from "bun:test";

import {
  deriveLogsPageState,
  filterRealtimeEntriesByCategory,
  mergeEntriesById,
  type LogsQueryResult
} from "./page";

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

describe("mergeEntriesById", () => {
  test("prepends realtime entries ahead of paginated entries", () => {
    const realtimeEntry = { ...ENTRY, id: "realtime-1" };
    const paginatedEntry = { ...ENTRY, id: "log-2" };

    expect(mergeEntriesById([realtimeEntry], [paginatedEntry])).toEqual([
      realtimeEntry,
      paginatedEntry
    ]);
  });

  test("dedupes by id, keeping the realtime (first-seen) occurrence", () => {
    const realtimeEntry = { ...ENTRY, id: "log-1", eventName: "realtime-version" };
    const paginatedEntry = { ...ENTRY, id: "log-1", eventName: "paginated-version" };

    expect(mergeEntriesById([realtimeEntry], [paginatedEntry])).toEqual([realtimeEntry]);
  });

  test("dedupes duplicate ids within the realtime list itself", () => {
    const first = { ...ENTRY, id: "dup", eventName: "first" };
    const second = { ...ENTRY, id: "dup", eventName: "second" };

    expect(mergeEntriesById([first, second], [])).toEqual([first]);
  });
});

describe("filterRealtimeEntriesByCategory", () => {
  const memberEntry = { ...ENTRY, eventName: "member.join" };
  const messageEntry = { ...ENTRY, id: "log-msg", eventName: "message.delete" };

  test("returns all entries unfiltered when category is 'all'", () => {
    expect(filterRealtimeEntriesByCategory([memberEntry, messageEntry], "all")).toEqual([
      memberEntry,
      messageEntry
    ]);
  });

  test("keeps only entries whose eventName maps to the selected category", () => {
    expect(filterRealtimeEntriesByCategory([memberEntry, messageEntry], "member")).toEqual([
      memberEntry
    ]);
  });

  test("excludes entries whose eventName does not match the selected category", () => {
    expect(filterRealtimeEntriesByCategory([messageEntry], "member")).toEqual([]);
  });
});
