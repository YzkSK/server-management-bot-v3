import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import {
  appendLogEventToStream,
  appendRealtimeLogEventToStream,
  LOGS_STREAM_KEY,
  readRealtimeLogEvents,
  REALTIME_LOGS_STREAM_PREFIX,
  type RedisStreamReader,
  type RedisStreamWriter,
  toLogStreamFields
} from "./log-stream.js";

const baseEvent: NormalizedEvent = {
  eventTimestamp: new Date("2026-07-18T00:00:00.000Z"),
  receivedAt: new Date("2026-07-18T00:00:01.000Z"),
  eventName: "member.join",
  guildId: "guild-1",
  actorId: "user-1",
  channelId: null,
  messageId: null,
  payload: { displayName: "test" }
};

function createFakeWriter() {
  const calls: Array<{ key: string; fields: Record<string, string> }> = [];
  const writer: RedisStreamWriter = {
    async xAdd(key, _id, fields) {
      calls.push({ key, fields });
      return "1-0";
    }
  };
  return { writer, calls };
}

describe("toLogStreamFields", () => {
  it("serializes a normalized event into flat string fields", () => {
    const fields = toLogStreamFields(baseEvent, { realtimeEnabled: true });

    assert.equal(fields.event_name, "member.join");
    assert.equal(fields.guild_id, "guild-1");
    assert.equal(fields.channel_id, "");
    assert.equal(fields.realtime_enabled, "1");
    assert.equal(fields.payload, JSON.stringify({ displayName: "test" }));
  });

  it("defaults realtime_enabled to '0' when not specified", () => {
    const fields = toLogStreamFields(baseEvent);
    assert.equal(fields.realtime_enabled, "0");
  });
});

describe("appendLogEventToStream", () => {
  it("writes to the shared LOGS_STREAM_KEY", async () => {
    const { writer, calls } = createFakeWriter();

    await appendLogEventToStream(writer, baseEvent);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.key, LOGS_STREAM_KEY);
  });
});

describe("appendRealtimeLogEventToStream", () => {
  it("writes to the per-guild realtime stream key", async () => {
    const { writer, calls } = createFakeWriter();

    await appendRealtimeLogEventToStream(writer, baseEvent);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.key, `${REALTIME_LOGS_STREAM_PREFIX}guild-1`);
  });

  it("does nothing when the event has no guildId", async () => {
    const { writer, calls } = createFakeWriter();

    const result = await appendRealtimeLogEventToStream(writer, {
      ...baseEvent,
      guildId: null
    });

    assert.equal(result, null);
    assert.equal(calls.length, 0);
  });
});

describe("readRealtimeLogEvents", () => {
  it("maps raw Redis stream messages back into typed log events", async () => {
    const reader: RedisStreamReader = {
      async xRead(streams) {
        assert.equal(streams[0]?.key, `${REALTIME_LOGS_STREAM_PREFIX}guild-1`);
        return [
          {
            name: streams[0]!.key,
            messages: [
              {
                id: "1-0",
                message: toLogStreamFields(baseEvent, { realtimeEnabled: true })
              }
            ]
          }
        ];
      }
    };

    const events = await readRealtimeLogEvents(reader, "guild-1", "0");

    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventName, "member.join");
    assert.equal(events[0]?.realtimeEnabled, true);
    assert.deepEqual(events[0]?.payload, { displayName: "test" });
  });

  it("returns an empty array when xRead returns null (timeout)", async () => {
    const reader: RedisStreamReader = {
      async xRead() {
        return null;
      }
    };

    const events = await readRealtimeLogEvents(reader, "guild-1", "0");
    assert.deepEqual(events, []);
  });
});
