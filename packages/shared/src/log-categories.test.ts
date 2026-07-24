import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { realtimeDefaultDisabledEvents, realtimeDefaultEnabledEvents } from "./events.js";
import {
  categoryForEventName,
  eventNamePrefixesForCategory,
  LOG_CATEGORIES
} from "./log-categories.js";

describe("categoryForEventName", () => {
  it("maps every known event name to a non-null category", () => {
    const allEvents = [...realtimeDefaultEnabledEvents, ...realtimeDefaultDisabledEvents];
    for (const eventName of allEvents) {
      assert.notEqual(
        categoryForEventName(eventName),
        null,
        `no category mapped for event "${eventName}"`
      );
    }
  });

  it("maps message.create to the message category", () => {
    assert.equal(categoryForEventName("message.create"), "message");
  });

  it("maps voice.temp.created to temp_vc, not voice", () => {
    assert.equal(categoryForEventName("voice.temp.created"), "temp_vc");
  });

  it("maps voice.session.join and call.started to voice", () => {
    assert.equal(categoryForEventName("voice.session.join"), "voice");
    assert.equal(categoryForEventName("call.started"), "voice");
  });

  it("maps config.updated and dashboard.login to the dashboard category", () => {
    assert.equal(categoryForEventName("config.updated"), "dashboard");
    assert.equal(categoryForEventName("dashboard.login"), "dashboard");
  });

  it("maps guild/role/channel/thread/invite/emoji/sticker/webhook events to audit", () => {
    for (const eventName of [
      "guild.update",
      "role.create",
      "channel.update",
      "thread.create",
      "invite.create",
      "emoji.create",
      "sticker.create",
      "webhook.create"
    ]) {
      assert.equal(categoryForEventName(eventName), "audit");
    }
  });

  it("returns null for an unrecognized event name", () => {
    assert.equal(categoryForEventName("totally.unknown.event"), null);
  });
});

describe("eventNamePrefixesForCategory", () => {
  it("returns null for the all category (no filtering)", () => {
    assert.equal(eventNamePrefixesForCategory("all"), null);
  });

  it("returns the audit prefixes for the audit category", () => {
    assert.deepEqual(eventNamePrefixesForCategory("audit"), [
      "guild.",
      "role.",
      "channel.",
      "thread.",
      "invite.",
      "emoji.",
      "sticker.",
      "webhook."
    ]);
  });

  it("LOG_CATEGORIES starts with all", () => {
    assert.equal(LOG_CATEGORIES[0], "all");
  });
});
