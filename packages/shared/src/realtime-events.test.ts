import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REALTIME_LOGS_SUBSCRIBE,
  REALTIME_LOGS_UNSUBSCRIBE,
  REALTIME_LOGS_EVENT,
  REALTIME_LOGS_ERROR,
  REALTIME_LOGS_ERROR_REASONS,
  REALTIME_LOGS_SUBSCRIBED
} from "./realtime-events.js";

describe("realtime-events", () => {
  it("defines distinct event names", () => {
    const names = [
      REALTIME_LOGS_SUBSCRIBE,
      REALTIME_LOGS_UNSUBSCRIBE,
      REALTIME_LOGS_EVENT,
      REALTIME_LOGS_ERROR,
      REALTIME_LOGS_SUBSCRIBED
    ];
    assert.equal(new Set(names).size, names.length);
  });

  it("defines at least the unauthenticated/forbidden error reasons", () => {
    assert.ok(REALTIME_LOGS_ERROR_REASONS.includes("unauthenticated"));
    assert.ok(REALTIME_LOGS_ERROR_REASONS.includes("forbidden"));
  });
});
