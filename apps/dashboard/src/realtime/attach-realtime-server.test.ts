import { EventEmitter } from "node:events";

import { describe, expect, test } from "bun:test";

import {
  REALTIME_LOGS_ERROR,
  REALTIME_LOGS_EVENT,
  REALTIME_LOGS_SUBSCRIBE,
  REALTIME_LOGS_UNSUBSCRIBE
} from "@sm-bot/shared";

import {
  createRealtimeLogsConnectionHandler,
  type ConnectionHandlerDeps
} from "./attach-realtime-server";

class FakeSocket extends EventEmitter {
  id = "socket-1";
  handshake = { headers: { cookie: "next-auth.session-token=fake" } };
  emitted: Array<{ event: string; payload: unknown }> = [];

  emit(event: string, payload?: unknown): boolean {
    this.emitted.push({ event, payload });
    // Node標準のEventEmitter.emitと同じくlistenerも呼び出す。
    // (実socket.ioのSocket.emitはネットワーク送信専用でlistenerを呼ばないが、
    //  このフェイクではsocket.emit(...)をクライアント→サーバのイベント発火の
    //  シミュレーションとしても使うため、super.emitでlistenerを起動する)
    super.emit(event, payload);
    return true;
  }
}

function deps(overrides: Partial<ConnectionHandlerDeps> = {}): ConnectionHandlerDeps {
  return {
    authenticate: async () => ({ ok: true, userId: "user-1", canViewRaw: false }),
    poll: async () => ({ messages: [], nextId: "$" }),
    pollIntervalMs: 1,
    ...overrides
  };
}

describe("createRealtimeLogsConnectionHandler", () => {
  test("emits REALTIME_LOGS_ERROR and does not start polling when auth fails", async () => {
    const socket = new FakeSocket();
    const pollCalls: string[] = [];
    const handler = createRealtimeLogsConnectionHandler(
      deps({
        authenticate: async () => ({ ok: false, reason: "forbidden" }),
        poll: async (guildId) => {
          pollCalls.push(guildId);
          return { messages: [], nextId: "$" };
        }
      })
    );

    handler(socket as never);
    socket.emit(REALTIME_LOGS_SUBSCRIBE, { guildId: "guild-1" });
    await socket.emit(REALTIME_LOGS_SUBSCRIBE, { guildId: "guild-1" });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(socket.emitted).toContainEqual({ event: REALTIME_LOGS_ERROR, payload: { reason: "forbidden" } });
    expect(pollCalls).toEqual([]);
  });

  test("polls and emits REALTIME_LOGS_EVENT per message when auth succeeds", async () => {
    const socket = new FakeSocket();
    let callCount = 0;
    const handler = createRealtimeLogsConnectionHandler(
      deps({
        poll: async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              messages: [
                {
                  id: "1-0",
                  eventName: "member.join",
                  guildId: "guild-1",
                  actorId: null,
                  channelId: null,
                  messageId: null,
                  eventTimestamp: new Date("2026-01-01T00:00:00.000Z"),
                  receivedAt: new Date("2026-01-01T00:00:00.000Z"),
                  realtimeEnabled: true,
                  payload: { foo: "bar" }
                }
              ],
              nextId: "1-0"
            };
          }
          return { messages: [], nextId: "1-0" };
        }
      })
    );

    handler(socket as never);
    socket.emit(REALTIME_LOGS_SUBSCRIBE, { guildId: "guild-1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.emit("disconnect");

    const events = socket.emitted.filter((e) => e.event === REALTIME_LOGS_EVENT);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.payload).toEqual({
      id: "1-0",
      eventName: "member.join",
      actorId: null,
      channelId: null,
      messageId: null,
      eventTimestamp: "2026-01-01T00:00:00.000Z",
      receivedAt: "2026-01-01T00:00:00.000Z",
      payload: null
    });
  });

  test("strips payload when canViewRaw is false, keeps it when true", async () => {
    const socket = new FakeSocket();
    const handler = createRealtimeLogsConnectionHandler(
      deps({
        authenticate: async () => ({ ok: true, userId: "user-1", canViewRaw: true }),
        poll: async () => ({
          messages: [
            {
              id: "1-0",
              eventName: "member.join",
              guildId: "guild-1",
              actorId: null,
              channelId: null,
              messageId: null,
              eventTimestamp: new Date("2026-01-01T00:00:00.000Z"),
              receivedAt: new Date("2026-01-01T00:00:00.000Z"),
              realtimeEnabled: true,
              payload: { foo: "bar" }
            }
          ],
          nextId: "1-0"
        })
      })
    );

    handler(socket as never);
    socket.emit(REALTIME_LOGS_SUBSCRIBE, { guildId: "guild-1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    socket.emit("disconnect");

    const event = socket.emitted.find((e) => e.event === REALTIME_LOGS_EVENT);
    expect((event?.payload as { payload: unknown }).payload).toEqual({ foo: "bar" });
  });

  test("stops polling on unsubscribe", async () => {
    const socket = new FakeSocket();
    let pollCount = 0;
    const handler = createRealtimeLogsConnectionHandler(
      deps({
        poll: async () => {
          pollCount += 1;
          return { messages: [], nextId: "$" };
        }
      })
    );

    handler(socket as never);
    socket.emit(REALTIME_LOGS_SUBSCRIBE, { guildId: "guild-1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    socket.emit(REALTIME_LOGS_UNSUBSCRIBE);
    const countAfterUnsubscribe = pollCount;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(pollCount).toBe(countAfterUnsubscribe);
  });

  test("resumes polling after unsubscribe then re-subscribe (does not permanently disable the socket)", async () => {
    const socket = new FakeSocket();
    let pollCount = 0;
    const handler = createRealtimeLogsConnectionHandler(
      deps({
        poll: async () => {
          pollCount += 1;
          return { messages: [], nextId: "$" };
        }
      })
    );

    handler(socket as never);
    socket.emit(REALTIME_LOGS_SUBSCRIBE, { guildId: "guild-1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    socket.emit(REALTIME_LOGS_UNSUBSCRIBE);
    const countAfterUnsubscribe = pollCount;

    socket.emit(REALTIME_LOGS_SUBSCRIBE, { guildId: "guild-1" });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(pollCount).toBeGreaterThan(countAfterUnsubscribe);

    socket.emit("disconnect");
  });
});
