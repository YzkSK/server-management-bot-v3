import { describe, expect, test } from "bun:test";

import { nextConnectionStatus } from "./realtime-connection-status";

describe("nextConnectionStatus", () => {
  test("idle -> subscribe -> connecting", () => {
    expect(nextConnectionStatus("idle", "subscribe")).toBe("connecting");
  });

  test("connecting -> connect -> connecting (waits for server ack)", () => {
    expect(nextConnectionStatus("connecting", "connect")).toBe("connecting");
  });

  test("connecting -> subscribed -> live", () => {
    expect(nextConnectionStatus("connecting", "subscribed")).toBe("live");
  });

  test("live -> disconnect -> offline", () => {
    expect(nextConnectionStatus("live", "disconnect")).toBe("offline");
  });

  test("offline -> connect -> connecting (auto-reconnect resumes handshake)", () => {
    expect(nextConnectionStatus("offline", "connect")).toBe("connecting");
  });

  test("any state -> error -> error", () => {
    expect(nextConnectionStatus("live", "error")).toBe("error");
    expect(nextConnectionStatus("connecting", "error")).toBe("error");
  });

  test("error -> subscribe -> connecting (manual/auto retry)", () => {
    expect(nextConnectionStatus("error", "subscribe")).toBe("connecting");
  });
});
