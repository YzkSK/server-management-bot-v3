import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { getLocale } from "@sm-bot/shared";

import { SettingsPageView, type SettingsPageState } from "./settings-view";

function noop() {}

const locale = getLocale("ja");

// Extracts just one radiogroup's HTML slice so "checked" assertions can be
// scoped per section instead of counted globally across the whole page.
function radiogroupHtml(html: string, ariaLabel: string) {
  const start = html.indexOf(`aria-label="${ariaLabel}"`);
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf("</div>", start);
  return html.slice(start, end);
}

function render(state: SettingsPageState) {
  return renderToString(
    <SettingsPageView
      state={state}
      locale={locale}
      onLogModeChange={noop}
      onLogModeSave={noop}
      onLogModeRetry={noop}
      onLanguageChange={noop}
      onLanguageRetry={noop}
      onRetry={noop}
    />
  );
}

const READY_BOTH: SettingsPageState = {
  kind: "loaded",
  logMode: { kind: "ready", value: "full", selected: "metadata_only", isSaving: false, saveError: null },
  language: { kind: "ready", value: "ja", selected: "ja", isSaving: false, saveError: null }
};

describe("SettingsPageView", () => {
  test("shows a permission message when the caller lacks access", () => {
    const html = render({ kind: "no-permission" });

    expect(html).toContain("この設定を変更する権限がありません。");
  });

  test("shows the localized loading message while loading", () => {
    const html = render({ kind: "loading" });

    expect(html).toContain(locale.settings.loading);
  });

  test("shows a generic error message without leaking the raw error, plus a retry button", () => {
    const html = render({ kind: "error", message: "boom", isRetrying: false });

    expect(html).toContain("設定の取得に失敗しました。");
    expect(html).not.toContain("boom");
    expect(html).toContain("再試行");
    expect(html).not.toContain('disabled=""');
  });

  test("disables the retry button and shows a retrying label while a retry is in flight", () => {
    const html = render({ kind: "error", message: "boom", isRetrying: true });

    expect(html).toContain("再試行中…");
    expect(html).toContain('disabled=""');
  });

  test("hides a section the caller lacks capability for", () => {
    const html = render({
      kind: "loaded",
      logMode: { kind: "hidden" },
      language: READY_BOTH.language
    });

    expect(html).not.toContain(locale.settings.logModeHeading);
    const headingIndex = html.indexOf("<h2");
    expect(headingIndex).toBeGreaterThan(-1);
    expect(html.slice(headingIndex, html.indexOf("</h2>", headingIndex))).toContain(
      locale.settings.languageHeading
    );
  });

  test("renders a radio option per log mode with the current selection checked", () => {
    const html = render(READY_BOTH);

    expect(html).toContain("本文を含めて記録");
    expect(html).toContain("本文を除いて記録");
    expect(html).toContain("記録しない");

    const group = radiogroupHtml(html, locale.settings.logModeHeading);
    expect(group.match(/checked=""/g)?.length).toBe(1);
    expect(group).toContain('checked="" value="metadata_only"');
  });

  test("disables the log mode save button when the selection matches the saved value", () => {
    const html = render({
      ...READY_BOTH,
      logMode: { kind: "ready", value: "full", selected: "full", isSaving: false, saveError: null }
    });

    const buttonStart = html.lastIndexOf("<button", html.indexOf(">保存<"));
    expect(html.slice(buttonStart, html.indexOf(">保存<"))).toContain('disabled=""');
  });

  test("enables the log mode save button when the selection differs from the saved value", () => {
    const html = render(READY_BOTH);

    const buttonStart = html.lastIndexOf("<button", html.indexOf(">保存<"));
    expect(html.slice(buttonStart, html.indexOf(">保存<"))).not.toContain('disabled=""');
  });

  test("shows the log mode save error message when present", () => {
    const html = render({
      ...READY_BOTH,
      logMode: { kind: "ready", value: "full", selected: "disabled", isSaving: false, saveError: "network error" }
    });

    expect(html).toContain("network error");
  });

  test("renders a radio option per language with the current selection checked", () => {
    const html = render(READY_BOTH);

    expect(html).toContain("日本語");
    expect(html).toContain("English");

    const group = radiogroupHtml(html, locale.settings.languageHeading);
    expect(group.match(/checked=""/g)?.length).toBe(1);
    expect(group).toContain('checked="" value="ja"');
  });

  test("shows the language save error message when present", () => {
    const html = render({
      ...READY_BOTH,
      language: { kind: "ready", value: "ja", selected: "en", isSaving: false, saveError: "language save failed" }
    });

    expect(html).toContain("language save failed");
  });

  test("renders English copy when given the English locale", () => {
    const html = renderToString(
      <SettingsPageView
        state={READY_BOTH}
        locale={getLocale("en")}
        onLogModeChange={noop}
        onLogModeSave={noop}
        onLogModeRetry={noop}
        onLanguageChange={noop}
        onLanguageRetry={noop}
        onRetry={noop}
      />
    );

    expect(html).toContain("Log recording mode");
    expect(html).toContain("Save");
  });
});
