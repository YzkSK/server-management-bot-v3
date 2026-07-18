import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { DbClient, insertLogEvent as InsertLogEvent } from "@sm-bot/db";
import type { NormalizedEvent } from "@sm-bot/shared";

import type { RedisStreamWriter } from "./log-stream.js";
import { writeLogEvent } from "./log-writer.js";

const baseEvent: NormalizedEvent = {
  eventTimestamp: new Date("2026-07-18T00:00:00.000Z"),
  receivedAt: new Date("2026-07-18T00:00:01.000Z"),
  eventName: "message.create",
  guildId: "guild-1",
  actorId: "user-1",
  channelId: "channel-1",
  messageId: "message-1",
  payload: { content: "hello" }
};

function createFakeRedis() {
  const calls: Array<{ key: string; fields: Record<string, string> }> = [];
  const redis: RedisStreamWriter = {
    async xAdd(key, _id, fields) {
      calls.push({ key, fields });
      return "1-0";
    }
  };
  return { redis, calls };
}

describe("writeLogEvent", () => {
  it("writes to the logs table and the shared stream, skipping the realtime stream for a disabled event", async () => {
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(
      async () => ({}) as Awaited<ReturnType<typeof InsertLogEvent>>
    );
    const { redis, calls } = createFakeRedis();
    const db = {} as DbClient;

    await writeLogEvent({ db, redis, insertLogEvent }, baseEvent);

    assert.equal(insertLogEvent.mock.calls.length, 1);
    const insertCall = insertLogEvent.mock.calls[0];
    assert.equal(insertCall?.arguments[0], db);
    assert.deepEqual(insertCall?.arguments[1], { ...baseEvent, realtimeEnabled: false });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.key, "logs:events");
    assert.equal(calls[0]?.fields.realtime_enabled, "0");
  });

  it("also appends to the per-guild realtime stream for a realtime-enabled event", async () => {
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(
      async () => ({}) as Awaited<ReturnType<typeof InsertLogEvent>>
    );
    const { redis, calls } = createFakeRedis();
    const db = {} as DbClient;
    const event: NormalizedEvent = { ...baseEvent, eventName: "message.delete" };

    await writeLogEvent({ db, redis, insertLogEvent }, event);

    assert.equal(insertLogEvent.mock.calls.length, 1);
    const insertCall = insertLogEvent.mock.calls[0];
    assert.equal(insertCall?.arguments[0], db);
    assert.deepEqual(insertCall?.arguments[1], { ...event, realtimeEnabled: true });

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.key, "logs:events");
    assert.equal(calls[0]?.fields.realtime_enabled, "1");
    assert.equal(calls[1]?.key, `rt:logs:${event.guildId}`);
    assert.equal(calls[1]?.fields.realtime_enabled, "1");
  });

  it("does not append to any Redis stream until the DB write resolves", async () => {
    let resolveDbWrite: (() => void) | undefined;
    const dbWritePending = new Promise<void>((resolve) => {
      resolveDbWrite = resolve;
    });
    const redisCallsBeforeDbResolved: string[] = [];
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => {
      await dbWritePending;
      return {} as Awaited<ReturnType<typeof InsertLogEvent>>;
    });
    const redis: RedisStreamWriter = {
      async xAdd(key) {
        redisCallsBeforeDbResolved.push(key);
        return "1-0";
      }
    };
    const event: NormalizedEvent = { ...baseEvent, eventName: "message.delete" };

    const writePromise = writeLogEvent({ db: {} as DbClient, redis, insertLogEvent }, event);

    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(
      redisCallsBeforeDbResolved,
      [],
      "Redis must not be written to before the DB write resolves"
    );

    resolveDbWrite?.();
    await writePromise;

    assert.equal(redisCallsBeforeDbResolved.length, 2);
  });

  it("does not append to any Redis stream when the DB write fails", async () => {
    const dbError = new Error("db unavailable");
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => {
      throw dbError;
    });
    const { redis, calls } = createFakeRedis();
    const event: NormalizedEvent = { ...baseEvent, eventName: "message.delete" };

    await assert.rejects(
      writeLogEvent({ db: {} as DbClient, redis, insertLogEvent }, event),
      dbError
    );

    assert.equal(calls.length, 0);
  });
});
