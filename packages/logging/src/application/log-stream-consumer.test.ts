import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NormalizedEvent } from "@sm-bot/shared";

import {
  ackLogEvents,
  ensureLogStreamConsumerGroup,
  readLogEventsAsConsumer,
  recoverPendingLogEvents,
  type RedisStreamGroupClient
} from "./log-stream-consumer.js";
import { REALTIME_LOGS_STREAM_PREFIX, toLogStreamFields } from "./log-stream.js";

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

function createFakeGroupClient(
  overrides: Partial<RedisStreamGroupClient> = {}
): RedisStreamGroupClient {
  return {
    xGroupCreate: async () => "OK",
    xReadGroup: async () => null,
    xAck: async () => 0,
    xPendingRange: async () => [],
    xClaim: async () => null,
    ...overrides
  };
}

describe("ensureLogStreamConsumerGroup", () => {
  it("creates the consumer group starting from new messages only by default", async () => {
    const calls: Array<{ key: string; group: string; id: string; options: unknown }> =
      [];
    const redis = createFakeGroupClient({
      async xGroupCreate(key, group, id, options) {
        calls.push({ key, group, id, options });
        return "OK";
      }
    });

    await ensureLogStreamConsumerGroup(redis, "logs:events", "dashboard");

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      key: "logs:events",
      group: "dashboard",
      id: "$",
      options: { MKSTREAM: true }
    });
  });

  it("creates the consumer group from the beginning when startId is overridden", async () => {
    const calls: Array<{ id: string }> = [];
    const redis = createFakeGroupClient({
      async xGroupCreate(_key, _group, id) {
        calls.push({ id });
        return "OK";
      }
    });

    await ensureLogStreamConsumerGroup(redis, "logs:events", "dashboard", {
      startId: "0"
    });

    assert.equal(calls[0]?.id, "0");
  });

  it("swallows BUSYGROUP errors because the group already exists", async () => {
    const redis = createFakeGroupClient({
      async xGroupCreate() {
        throw new Error("BUSYGROUP Consumer Group name already exists");
      }
    });

    await assert.doesNotReject(() =>
      ensureLogStreamConsumerGroup(redis, "logs:events", "dashboard")
    );
  });

  it("rethrows unexpected errors", async () => {
    const redis = createFakeGroupClient({
      async xGroupCreate() {
        throw new Error("NOPERM this user has no permissions");
      }
    });

    await assert.rejects(
      () => ensureLogStreamConsumerGroup(redis, "logs:events", "dashboard"),
      /NOPERM/
    );
  });
});

describe("readLogEventsAsConsumer", () => {
  it("reads new messages as the given consumer via xReadGroup", async () => {
    const streamKey = `${REALTIME_LOGS_STREAM_PREFIX}guild-1`;
    const redis = createFakeGroupClient({
      async xReadGroup(group, consumer, streams) {
        assert.equal(group, "dashboard");
        assert.equal(consumer, "dashboard-1");
        assert.deepEqual(streams, [{ key: streamKey, id: ">" }]);
        return [
          {
            name: streamKey,
            messages: [
              {
                id: "1-0",
                message: toLogStreamFields(baseEvent, { realtimeEnabled: true })
              }
            ]
          }
        ];
      }
    });

    const events = await readLogEventsAsConsumer(
      redis,
      streamKey,
      "dashboard",
      "dashboard-1"
    );

    assert.equal(events.length, 1);
    assert.equal(events[0]?.id, "1-0");
    assert.equal(events[0]?.eventName, "member.join");
  });

  it("returns an empty array when xReadGroup returns null (timeout)", async () => {
    const redis = createFakeGroupClient();

    const events = await readLogEventsAsConsumer(
      redis,
      "logs:events",
      "dashboard",
      "dashboard-1"
    );
    assert.deepEqual(events, []);
  });
});

describe("ackLogEvents", () => {
  it("acknowledges the given message ids", async () => {
    const calls: Array<{ key: string; group: string; id: string | string[] }> = [];
    const redis = createFakeGroupClient({
      async xAck(key, group, id) {
        calls.push({ key, group, id });
        return Array.isArray(id) ? id.length : 1;
      }
    });

    const count = await ackLogEvents(redis, "logs:events", "dashboard", [
      "1-0",
      "2-0"
    ]);

    assert.equal(count, 2);
    assert.deepEqual(calls, [
      { key: "logs:events", group: "dashboard", id: ["1-0", "2-0"] }
    ]);
  });

  it("skips the round-trip when there are no ids to ack", async () => {
    let called = false;
    const redis = createFakeGroupClient({
      async xAck() {
        called = true;
        return 0;
      }
    });

    const count = await ackLogEvents(redis, "logs:events", "dashboard", []);

    assert.equal(count, 0);
    assert.equal(called, false);
  });
});

describe("recoverPendingLogEvents", () => {
  it("claims idle pending entries and returns them for reprocessing", async () => {
    const redis = createFakeGroupClient({
      async xPendingRange(key, group, start, end, count, options) {
        assert.equal(key, "logs:events");
        assert.equal(group, "dashboard");
        assert.equal(start, "-");
        assert.equal(end, "+");
        assert.equal(count, 100);
        assert.deepEqual(options, { IDLE: 5000 });
        return [
          {
            id: "1-0",
            owner: "dashboard-crashed",
            millisecondsSinceLastDelivery: 60000,
            deliveriesCounter: 1
          }
        ];
      },
      async xClaim(key, group, consumer, minIdleTime, id) {
        assert.equal(key, "logs:events");
        assert.equal(group, "dashboard");
        assert.equal(consumer, "dashboard-1");
        assert.equal(minIdleTime, 5000);
        assert.deepEqual(id, ["1-0"]);
        return [
          {
            id: "1-0",
            message: toLogStreamFields(baseEvent, { realtimeEnabled: true })
          }
        ];
      }
    });

    const recovered = await recoverPendingLogEvents(
      redis,
      "logs:events",
      "dashboard",
      "dashboard-1"
    );

    assert.equal(recovered.length, 1);
    assert.equal(recovered[0]?.id, "1-0");
    assert.equal(recovered[0]?.eventName, "member.join");
  });

  it("does not reclaim pending entries already owned by the current consumer", async () => {
    let claimCalled = false;
    const redis = createFakeGroupClient({
      async xPendingRange() {
        return [
          {
            id: "1-0",
            owner: "dashboard-1",
            millisecondsSinceLastDelivery: 60000,
            deliveriesCounter: 1
          }
        ];
      },
      async xClaim() {
        claimCalled = true;
        return null;
      }
    });

    const recovered = await recoverPendingLogEvents(
      redis,
      "logs:events",
      "dashboard",
      "dashboard-1"
    );

    assert.deepEqual(recovered, []);
    assert.equal(claimCalled, false);
  });

  it("returns an empty array without claiming when there is nothing pending", async () => {
    let claimCalled = false;
    const redis = createFakeGroupClient({
      async xPendingRange() {
        return [];
      },
      async xClaim() {
        claimCalled = true;
        return null;
      }
    });

    const recovered = await recoverPendingLogEvents(
      redis,
      "logs:events",
      "dashboard",
      "dashboard-1"
    );

    assert.deepEqual(recovered, []);
    assert.equal(claimCalled, false);
  });
});
