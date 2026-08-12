import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGuildLanguage } from "./guild-language.js";

describe("isGuildLanguage", () => {
  it("accepts only ja and en", () => {
    assert.equal(isGuildLanguage("ja"), true);
    assert.equal(isGuildLanguage("en"), true);
    assert.equal(isGuildLanguage("fr"), false);
    assert.equal(isGuildLanguage(""), false);
  });
});
