import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { SettingsPageView, type SettingsPageState } from "./settings-view";

function noop() {}

function render(state: SettingsPageState) {
  return renderToString(
    <SettingsPageView state={state} onLogModeChange={noop} onSave={noop} onRetry={noop} />
  );
}

describe("SettingsPageView", () => {
  test("shows a permission message when the caller lacks access", () => {
    const html = render({ kind: "no-permission" });

    expect(html).toContain("この設定を変更する権限がありません。");
  });

  test("shows Loading... while loading", () => {
    const html = render({ kind: "loading" });

    expect(html).toContain("Loading...");
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

  test("renders a radio option per log mode with the current selection checked", () => {
    const html = render({
      kind: "loaded",
      logMode: "full",
      selectedLogMode: "metadata_only",
      isSaving: false,
      saveError: null
    });

    expect(html).toContain("本文を含めて記録");
    expect(html).toContain("本文を除いて記録");
    expect(html).toContain("記録しない");
    expect(html.match(/checked=""/g)?.length).toBe(1);
  });

  test("disables the save button when the selection matches the saved log mode", () => {
    const html = render({
      kind: "loaded",
      logMode: "full",
      selectedLogMode: "full",
      isSaving: false,
      saveError: null
    });

    const buttonStart = html.lastIndexOf("<button", html.indexOf(">保存<"));
    expect(html.slice(buttonStart, html.indexOf(">保存<"))).toContain('disabled=""');
  });

  test("enables the save button when the selection differs from the saved log mode", () => {
    const html = render({
      kind: "loaded",
      logMode: "full",
      selectedLogMode: "disabled",
      isSaving: false,
      saveError: null
    });

    const buttonStart = html.lastIndexOf("<button", html.indexOf(">保存<"));
    expect(html.slice(buttonStart, html.indexOf(">保存<"))).not.toContain('disabled=""');
  });

  test("shows the save error message when present", () => {
    const html = render({
      kind: "loaded",
      logMode: "full",
      selectedLogMode: "disabled",
      isSaving: false,
      saveError: "network error"
    });

    expect(html).toContain("network error");
  });
});
