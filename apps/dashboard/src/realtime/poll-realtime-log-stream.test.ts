import { describe, expect, test } from "bun:test";

import { pollRealtimeLogStream, type XReadClient } from "./poll-realtime-log-stream";

describe("pollRealtimeLogStream", () => {
  test("returns no messages and keeps lastId when the stream has nothing new", async () => {
    const redis: XReadClient = { xRead: async () => null };

    const result = await pollRealtimeLogStream(redis, "guild-1", "$");

    expect(result).toEqual({ messages: [], nextId: "$" });
  });

  test("reads from rt:logs:<guildId> and advances nextId to the last message id", async () => {
    const seenArgs: unknown[] = [];
    const redis: XReadClient = {
      xRead: async (streams, options) => {
        seenArgs.push({ streams, options });
        return [
          {
            name: "rt:logs:guild-1",
            messages: [
              { id: "1-0", message: { event_name: "member.join", guild_id: "guild-1" } },
              { id: "2-0", message: { event_name: "member.leave", guild_id: "guild-1" } }
            ]
          }
        ];
      }
    };

    const result = await pollRealtimeLogStream(redis, "guild-1", "$", { blockMs: 1000, count: 10 });

    expect(seenArgs).toEqual([
      { streams: [{ key: "rt:logs:guild-1", id: "$" }], options: { BLOCK: 1000, COUNT: 10 } }
    ]);
    expect(result.nextId).toBe("2-0");
    expect(result.messages.map((m) => m.eventName)).toEqual(["member.join", "member.leave"]);
  });
});
