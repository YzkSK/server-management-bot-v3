import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scrubSensitiveStrings } from "./log-scrubber.js";

describe("scrubSensitiveStrings", () => {
  it("masks a Discord bot token style three-part dot-separated string", () => {
    const payload = {
      content: "here is my token: MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.AbCdEfGhIjKlMnOpQrStUvWxYz123456"
    };

    const result = scrubSensitiveStrings(payload);

    assert.equal(
      result.content,
      "here is my token: [REDACTED_TOKEN]"
    );
  });

  it("masks a JWT-shaped string", () => {
    const payload = {
      content:
        "auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    };

    const result = scrubSensitiveStrings(payload);

    assert.equal(result.content, "auth=[REDACTED_TOKEN]");
  });

  it("masks a Bearer-prefixed token", () => {
    const payload = { content: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456" };

    const result = scrubSensitiveStrings(payload);

    assert.equal(result.content, "Authorization: Bearer [REDACTED_TOKEN]");
  });

  it("masks a credit-card-like number with and without separators", () => {
    const payload = {
      content: "card 4111111111111111 or 4111-1111-1111-1111"
    };

    const result = scrubSensitiveStrings(payload);

    assert.equal(result.content, "card [REDACTED_CARD] or [REDACTED_CARD]");
  });

  it("masks an IPv4 address", () => {
    const payload = { content: "connect to 192.168.0.10 now" };

    const result = scrubSensitiveStrings(payload);

    assert.equal(result.content, "connect to [REDACTED_IP] now");
  });

  it("masks an IPv6 address", () => {
    const payload = { content: "server at 2001:0db8:85a3:0000:0000:8a2e:0370:7334" };

    const result = scrubSensitiveStrings(payload);

    assert.equal(result.content, "server at [REDACTED_IP]");
  });

  it("recurses into nested objects and arrays", () => {
    const payload = {
      embeds: [
        { description: "ip 10.0.0.1 here" },
        { fields: [{ value: "card 4111111111111111" }] }
      ]
    };

    const result = scrubSensitiveStrings(payload);

    assert.equal(
      (result.embeds as Array<Record<string, unknown>>)[0]?.description,
      "ip [REDACTED_IP] here"
    );
    const nestedFields = (result.embeds as Array<Record<string, unknown>>)[1]
      ?.fields as Array<Record<string, unknown>>;
    assert.equal(nestedFields[0]?.value, "card [REDACTED_CARD]");
  });

  it("leaves ordinary strings, numbers, booleans, and null untouched", () => {
    const payload = {
      content: "just a normal message with no secrets",
      count: 42,
      partial: false,
      channelId: null
    };

    assert.deepEqual(scrubSensitiveStrings(payload), payload);
  });

  it("does not mutate the input payload", () => {
    const payload = { content: "ip 10.0.0.1" };
    const original = { ...payload };

    scrubSensitiveStrings(payload);

    assert.deepEqual(payload, original);
  });
});
