import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { GuildSelectorView, type GuildSelectorState } from "./guild-selector";

describe("GuildSelectorView", () => {
  test("renders Loading... while loading", () => {
    const html = renderToString(<GuildSelectorView state={{ kind: "loading" }} />);
    expect(html).toContain("Loading...");
  });

  test("renders a generic error message on failure without leaking the raw error", () => {
    const html = renderToString(
      <GuildSelectorView state={{ kind: "error", message: "boom" }} />
    );
    expect(html).toContain("ギルド一覧の取得に失敗しました。");
    expect(html).not.toContain("boom");
  });

  test("renders a message when there are no accessible guilds", () => {
    const html = renderToString(<GuildSelectorView state={{ kind: "loaded", guilds: [] }} />);
    expect(html).toContain("No accessible guilds found.");
  });

  test("renders a link per guild", () => {
    const state: GuildSelectorState = {
      kind: "loaded",
      guilds: [
        { id: "guild-1", name: "Guild One" },
        { id: "guild-2", name: "Guild Two" }
      ]
    };
    const html = renderToString(<GuildSelectorView state={state} />);
    expect(html).toContain("Guild One");
    expect(html).toContain("href=\"/g/guild-1\"");
    expect(html).toContain("Guild Two");
    expect(html).toContain("href=\"/g/guild-2\"");
  });
});
