import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getLocale } from "./index.js";

describe("getLocale", () => {
  it("returns the Japanese dictionary for ja", () => {
    assert.equal(getLocale("ja").settings.save, "保存");
  });

  it("returns the English dictionary for en", () => {
    assert.equal(getLocale("en").settings.save, "Save");
  });

  it("interpolates the count into newLogsCount for both languages", () => {
    assert.equal(getLocale("ja").logs.newLogsCount({ count: 3 }), "3件の新着 ↑");
    assert.equal(getLocale("en").logs.newLogsCount({ count: 3 }), "3 new ↑");
  });
});
