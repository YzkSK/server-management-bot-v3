import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import {
  appendLogEventToStream,
  appendRealtimeLogEventToStream,
  LOGS_STREAM_KEY,
  REALTIME_LOGS_STREAM_PREFIX,
  type RedisStreamMessage,
  type RedisStreamWriter,
  toLogStreamFields,
  toRealtimeLogMessage
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

  it("defaults log_id to an empty string when not specified", () => {
    const fields = toLogStreamFields(baseEvent);
    assert.equal(fields.log_id, "");
  });

  it("carries the DB log id through to log_id when specified", () => {
    const fields = toLogStreamFields(baseEvent, { logId: "abc-123" });
    assert.equal(fields.log_id, "abc-123");
  });
});

describe("toRealtimeLogMessage", () => {
  function createMessage(
    overrides: Partial<RedisStreamMessage["message"]> = {}
  ): RedisStreamMessage {
    return {
      id: "1699999999-0",
      message: {
        event_name: "member.join",
        guild_id: "guild-1",
        actor_id: "user-1",
        channel_id: "",
        message_id: "",
        event_timestamp: "2026-07-18T00:00:00.000Z",
        received_at: "2026-07-18T00:00:01.000Z",
        realtime_enabled: "1",
        payload: "{}",
        ...overrides
      }
    };
  }

  it("prefers the DB log id (log_id field) over the raw Redis stream entry id", () => {
    const message = createMessage({ log_id: "db-uuid-1" });
    const result = toRealtimeLogMessage(message);
    assert.equal(result.id, "db-uuid-1");
  });

  it("falls back to the raw Redis stream entry id when log_id is empty", () => {
    const message = createMessage({ log_id: "" });
    const result = toRealtimeLogMessage(message);
    assert.equal(result.id, "1699999999-0");
  });

  it("falls back to the raw Redis stream entry id when log_id is absent (old entries)", () => {
    const message = createMessage();
    delete (message.message as Record<string, string>).log_id;
    const result = toRealtimeLogMessage(message);
    assert.equal(result.id, "1699999999-0");
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
