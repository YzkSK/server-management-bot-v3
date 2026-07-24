import { describe, expect, test } from "bun:test";

import { filterRealtimeEntriesByCategory } from "./filter-realtime-entries-by-category";

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
