import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type {
  DbClient,
  GuildLogMode,
  getGuildLogMode as GetGuildLogMode,
  insertLogEvent as InsertLogEvent,
  markLogEventStreamSynced as MarkLogEventStreamSynced,
  upsertGuild as UpsertGuild
} from "@sm-bot/db";
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

function createFakeGetGuildLogMode(logMode: GuildLogMode) {
  return mock.fn<typeof GetGuildLogMode>(async () => logMode);
}

function createFakeUpsertGuild() {
  return mock.fn<typeof UpsertGuild>(async () => {});
}

function createFakeMarkLogEventStreamSynced() {
  return mock.fn<typeof MarkLogEventStreamSynced>(async () => {});
}

describe("writeLogEvent", () => {
  it("writes to the logs table and the shared stream, skipping the realtime stream for a disabled event", async () => {
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(
      async () => ({}) as Awaited<ReturnType<typeof InsertLogEvent>>
    );
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();
    const db = {} as DbClient;

    await writeLogEvent(
      { db, redis, insertLogEvent, getGuildLogMode, upsertGuild, markLogEventStreamSynced },
      baseEvent
    );

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
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();
    const db = {} as DbClient;
    const event: NormalizedEvent = { ...baseEvent, eventName: "message.delete" };

    await writeLogEvent(
      { db, redis, insertLogEvent, getGuildLogMode, upsertGuild, markLogEventStreamSynced },
      event
    );

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
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const redis: RedisStreamWriter = {
      async xAdd(key) {
        redisCallsBeforeDbResolved.push(key);
        return "1-0";
      }
    };
    const event: NormalizedEvent = { ...baseEvent, eventName: "message.delete" };

    const writePromise = writeLogEvent(
      { db: {} as DbClient, redis, insertLogEvent, getGuildLogMode, upsertGuild, markLogEventStreamSynced },
      event
    );

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
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();
    const event: NormalizedEvent = { ...baseEvent, eventName: "message.delete" };

    await assert.rejects(
      writeLogEvent(
        {
          db: {} as DbClient,
          redis,
          insertLogEvent,
          getGuildLogMode,
          upsertGuild,
          markLogEventStreamSynced
        },
        event
      ),
      dbError
    );

    assert.equal(calls.length, 0);
  });

  it("does not write to the DB or Redis at all for a disabled-logMode message event", async () => {
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(
      async () => ({}) as Awaited<ReturnType<typeof InsertLogEvent>>
    );
    const getGuildLogMode = createFakeGetGuildLogMode("disabled");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();

    await writeLogEvent(
      {
        db: {} as DbClient,
        redis,
        insertLogEvent,
        getGuildLogMode,
        upsertGuild,
        markLogEventStreamSynced
      },
      baseEvent
    );

    assert.equal(getGuildLogMode.mock.calls.length, 1);
    assert.equal(insertLogEvent.mock.calls.length, 0);
    assert.equal(calls.length, 0);
  });

  it("strips message content before persisting under a metadata_only logMode", async () => {
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(
      async () => ({}) as Awaited<ReturnType<typeof InsertLogEvent>>
    );
    const getGuildLogMode = createFakeGetGuildLogMode("metadata_only");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();

    await writeLogEvent(
      {
        db: {} as DbClient,
        redis,
        insertLogEvent,
        getGuildLogMode,
        upsertGuild,
        markLogEventStreamSynced
      },
      baseEvent
    );

    const insertCall = insertLogEvent.mock.calls[0];
    assert.equal((insertCall?.arguments[1] as NormalizedEvent).payload.content, undefined);

    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0]?.fields.payload ?? "{}").content, undefined);
  });

  it("does not consult logMode for a non-message event and always writes it in full", async () => {
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(
      async () => ({}) as Awaited<ReturnType<typeof InsertLogEvent>>
    );
    const getGuildLogMode = createFakeGetGuildLogMode("disabled");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();
    const event: NormalizedEvent = {
      ...baseEvent,
      eventName: "member.join",
      payload: { displayName: "test" }
    };

    await writeLogEvent(
      {
        db: {} as DbClient,
        redis,
        insertLogEvent,
        getGuildLogMode,
        upsertGuild,
        markLogEventStreamSynced
      },
      event
    );

    // 対象外イベントでは無駄なDB lookupを避けるためgetGuildLogModeを呼ばない。
    assert.equal(getGuildLogMode.mock.calls.length, 0);
    assert.equal(insertLogEvent.mock.calls.length, 1);
    // member.joinはrealtime-policyのデフォルト有効イベントのため共有streamと
    // per-guild realtime streamの両方に書かれる(resolveRealtimeEnabled参照)。
    assert.equal(calls.length, 2);
  });

  it("skips the logMode lookup entirely for events without a guildId", async () => {
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(
      async () => ({}) as Awaited<ReturnType<typeof InsertLogEvent>>
    );
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();
    const event: NormalizedEvent = { ...baseEvent, guildId: null };

    await writeLogEvent(
      {
        db: {} as DbClient,
        redis,
        insertLogEvent,
        getGuildLogMode,
        upsertGuild,
        markLogEventStreamSynced
      },
      event
    );

    assert.equal(getGuildLogMode.mock.calls.length, 0);
    assert.equal(insertLogEvent.mock.calls.length, 1);
    assert.equal(calls.length, 1);
  });

  it("upserts the guild and retries once when insertLogEvent fails with a foreign key violation", async () => {
    const fkError = Object.assign(new Error("insert or update on table violates foreign key"), {
      code: "23503"
    });
    let callCount = 0;
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw fkError;
      }
      return {} as Awaited<ReturnType<typeof InsertLogEvent>>;
    });
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();
    const db = {} as DbClient;

    await writeLogEvent(
      { db, redis, insertLogEvent, getGuildLogMode, upsertGuild, markLogEventStreamSynced },
      baseEvent
    );

    assert.equal(upsertGuild.mock.calls.length, 1);
    assert.equal(upsertGuild.mock.calls[0]?.arguments[0], db);
    assert.equal(upsertGuild.mock.calls[0]?.arguments[1], baseEvent.guildId);
    assert.equal(insertLogEvent.mock.calls.length, 2);
    assert.equal(calls.length, 1);
  });

  it("detects a foreign key violation wrapped in err.cause, matching drizzle-orm's postgres-js error shape", async () => {
    // drizzle-orm(postgres-js)はドライバのエラーをDrizzleQueryErrorでラップし、実際のPostgres
    // エラーコードは`err.cause.code`に入る(packages/db/src/schema/logs.test.tsのunwrapPostgresError参照)。
    const pgError = Object.assign(new Error("foreign key violation"), { code: "23503" });
    const wrappedError = Object.assign(new Error("Failed query"), { cause: pgError });
    let callCount = 0;
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw wrappedError;
      }
      return {} as Awaited<ReturnType<typeof InsertLogEvent>>;
    });
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();
    const db = {} as DbClient;

    await writeLogEvent(
      { db, redis, insertLogEvent, getGuildLogMode, upsertGuild, markLogEventStreamSynced },
      baseEvent
    );

    assert.equal(upsertGuild.mock.calls.length, 1);
    assert.equal(insertLogEvent.mock.calls.length, 2);
    assert.equal(calls.length, 1);
  });

  it("retries only once and rethrows when the retry also fails with a foreign key violation", async () => {
    const fkError = Object.assign(new Error("insert or update on table violates foreign key"), {
      code: "23503"
    });
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => {
      throw fkError;
    });
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();

    await assert.rejects(
      writeLogEvent(
        {
          db: {} as DbClient,
          redis,
          insertLogEvent,
          getGuildLogMode,
          upsertGuild,
          markLogEventStreamSynced
        },
        baseEvent
      ),
      fkError
    );

    assert.equal(upsertGuild.mock.calls.length, 1);
    assert.equal(insertLogEvent.mock.calls.length, 2);
    assert.equal(calls.length, 0);
  });

  it("does not retry and rethrows when insertLogEvent fails with a non-foreign-key error", async () => {
    const dbError = new Error("db unavailable");
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => {
      throw dbError;
    });
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();

    await assert.rejects(
      writeLogEvent(
        {
          db: {} as DbClient,
          redis,
          insertLogEvent,
          getGuildLogMode,
          upsertGuild,
          markLogEventStreamSynced
        },
        baseEvent
      ),
      dbError
    );

    assert.equal(upsertGuild.mock.calls.length, 0);
    assert.equal(insertLogEvent.mock.calls.length, 1);
    assert.equal(calls.length, 0);
  });

  it("does not retry a foreign key violation for an event without a guildId", async () => {
    const fkError = Object.assign(new Error("insert or update on table violates foreign key"), {
      code: "23503"
    });
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => {
      throw fkError;
    });
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis, calls } = createFakeRedis();
    const event: NormalizedEvent = { ...baseEvent, guildId: null };

    await assert.rejects(
      writeLogEvent(
        {
          db: {} as DbClient,
          redis,
          insertLogEvent,
          getGuildLogMode,
          upsertGuild,
          markLogEventStreamSynced
        },
        event
      ),
      fkError
    );

    assert.equal(upsertGuild.mock.calls.length, 0);
    assert.equal(insertLogEvent.mock.calls.length, 1);
    assert.equal(calls.length, 0);
  });

  it("marks the log row as stream-synced after a successful stream write", async () => {
    const insertedLog = { id: "log-1" } as Awaited<ReturnType<typeof InsertLogEvent>>;
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => insertedLog);
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis } = createFakeRedis();
    const db = {} as DbClient;

    await writeLogEvent(
      { db, redis, insertLogEvent, getGuildLogMode, upsertGuild, markLogEventStreamSynced },
      baseEvent
    );

    assert.equal(markLogEventStreamSynced.mock.calls.length, 1);
    assert.equal(markLogEventStreamSynced.mock.calls[0]?.arguments[0], db);
    assert.equal(markLogEventStreamSynced.mock.calls[0]?.arguments[1], "log-1");
  });

  it("scrubs sensitive strings from the payload before persisting", async () => {
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(
      async () => ({}) as Awaited<ReturnType<typeof InsertLogEvent>>
    );
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const { redis } = createFakeRedis();
    const db = {} as DbClient;
    const event: NormalizedEvent = {
      ...baseEvent,
      payload: { content: "connect to 10.0.0.1 please" }
    };

    await writeLogEvent(
      { db, redis, insertLogEvent, getGuildLogMode, upsertGuild, markLogEventStreamSynced },
      event
    );

    const insertCall = insertLogEvent.mock.calls[0];
    assert.deepEqual(
      (insertCall?.arguments[1] as { payload: Record<string, unknown> }).payload,
      { content: "connect to [REDACTED_IP] please" }
    );
  });

  it("does not throw and does not mark the row synced when the stream write fails", async () => {
    const insertedLog = { id: "log-1" } as Awaited<ReturnType<typeof InsertLogEvent>>;
    const insertLogEvent = mock.fn<typeof InsertLogEvent>(async () => insertedLog);
    const getGuildLogMode = createFakeGetGuildLogMode("full");
    const upsertGuild = createFakeUpsertGuild();
    const markLogEventStreamSynced = createFakeMarkLogEventStreamSynced();
    const redis: RedisStreamWriter = {
      async xAdd() {
        throw new Error("redis unavailable");
      }
    };
    const db = {} as DbClient;

    await writeLogEvent(
      { db, redis, insertLogEvent, getGuildLogMode, upsertGuild, markLogEventStreamSynced },
      baseEvent
    );

    assert.equal(markLogEventStreamSynced.mock.calls.length, 0);
  });
});
