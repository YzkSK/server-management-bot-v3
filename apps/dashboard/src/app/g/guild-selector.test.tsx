import { getLocale } from "@sm-bot/shared";
import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { detectBrowserLanguage, GuildSelectorView, type GuildSelectorState } from "./guild-selector";

describe("GuildSelectorView", () => {
  test("renders the localized loading message while loading", () => {
    const jaHtml = renderToString(
      <GuildSelectorView state={{ kind: "loading" }} locale={getLocale("ja")} />
    );
    expect(jaHtml).toContain("読み込み中...");

    const enHtml = renderToString(
      <GuildSelectorView state={{ kind: "loading" }} locale={getLocale("en")} />
    );
    expect(enHtml).toContain("Loading...");
  });

  test("renders a generic error message on failure without leaking the raw error", () => {
    const html = renderToString(
      <GuildSelectorView state={{ kind: "error", message: "boom" }} locale={getLocale("ja")} />
    );
    expect(html).toContain("ギルド一覧の取得に失敗しました。");
    expect(html).not.toContain("boom");
  });

  test("renders a localized message when there are no accessible guilds", () => {
    const jaHtml = renderToString(
      <GuildSelectorView state={{ kind: "loaded", guilds: [] }} locale={getLocale("ja")} />
    );
    expect(jaHtml).toContain("アクセスできるサーバーが見つかりません。");

    const enHtml = renderToString(
      <GuildSelectorView state={{ kind: "loaded", guilds: [] }} locale={getLocale("en")} />
    );
    expect(enHtml).toContain("No accessible guilds found.");
  });

  test("renders a link per guild", () => {
    const state: GuildSelectorState = {
      kind: "loaded",
      guilds: [
        { id: "guild-1", name: "Guild One" },
        { id: "guild-2", name: "Guild Two" }
      ]
    };
    const html = renderToString(<GuildSelectorView state={state} locale={getLocale("ja")} />);
    expect(html).toContain("Guild One");
    expect(html).toContain("href=\"/g/guild-1\"");
    expect(html).toContain("Guild Two");
    expect(html).toContain("href=\"/g/guild-2\"");
  });
});

describe("detectBrowserLanguage", () => {
  test("returns ja for Japanese browser locales", () => {
    expect(detectBrowserLanguage("ja")).toBe("ja");
    expect(detectBrowserLanguage("ja-JP")).toBe("ja");
  });

  test("returns en for English and other non-Japanese browser locales", () => {
    expect(detectBrowserLanguage("en-US")).toBe("en");
    expect(detectBrowserLanguage("fr-FR")).toBe("en");
    expect(detectBrowserLanguage("")).toBe("en");
  });
});

describe("GuildSelectorView with the English locale", () => {
  test("renders the English error message", () => {
    const html = renderToString(
      <GuildSelectorView state={{ kind: "error", message: "boom" }} locale={getLocale("en")} />
    );
    expect(html).toContain("Failed to load the guild list.");
  });
});
