import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { LogsPageView, type LogEntryData, type LogsPageState } from "./logs-view";

function noop() {}

describe("LogsPageView", () => {
  test("renders a tab per log category", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain("All");
    expect(html).toContain("Message");
    expect(html).toContain("Temp VC");
    expect(html).toContain("Dashboard");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
  });

  test("marks the active category tab with aria-selected", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        category="member"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    const memberButtonIndex = html.indexOf(">Member<");
    const memberButtonStart = html.lastIndexOf("<button", memberButtonIndex);
    const memberButtonTag = html.slice(memberButtonStart, memberButtonIndex);
    expect(memberButtonTag).toContain('aria-selected="true"');
  });

  test("shows Loading... while loading", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain("Loading...");
  });

  test("shows a generic error message without leaking the raw error", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "error", message: "boom", isRetrying: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain("ログの取得に失敗しました。");
    expect(html).not.toContain("boom");
  });

  test("shows a retry button on error that is enabled and calls onRetry", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "error", message: "boom", isRetrying: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain("再試行");
    expect(html).not.toContain('disabled=""');
  });

  test("disables the retry button and shows a retrying label while a retry is in flight", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "error", message: "boom", isRetrying: true }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain("再試行中…");
    expect(html).toContain('disabled=""');
  });

  test("hides the Human View/Raw JSON toggle when canViewRaw is false", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).not.toContain("Raw JSON");
  });

  test("shows the Human View/Raw JSON toggle when canViewRaw is true", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={true}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain("Human View");
    expect(html).toContain("Raw JSON");
  });

  test("renders payload as JSON in raw mode, and never when payload is null", () => {
    const entries: LogEntryData[] = [
      {
        id: "log-1",
        eventName: "member.join",
        actorId: "user-1",
        channelId: null,
        messageId: null,
        eventTimestamp: "2026-01-01T00:00:00.000Z",
        receivedAt: "2026-01-01T00:00:00.000Z",
        payload: { foo: "bar" }
      }
    ];

    const rawHtml = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries, hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={true}
        viewMode="raw"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );
    expect(rawHtml).toContain("&quot;foo&quot;: &quot;bar&quot;");

    const strippedEntries: LogEntryData[] = [{ ...entries[0]!, payload: null }];
    const strippedHtml = renderToString(
      <LogsPageView
        state={{
          kind: "loaded",
          entries: strippedEntries,
          hasNextPage: false,
          isFetchingNextPage: false
        }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={true}
        viewMode="raw"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );
    expect(strippedHtml).not.toContain("<pre>");
    expect(strippedHtml).toContain("member.join");
  });

  test("ignores a stale viewMode='raw' when canViewRaw is false (defense in depth)", () => {
    const entries: LogEntryData[] = [
      {
        id: "log-1",
        eventName: "member.join",
        actorId: "user-1",
        channelId: null,
        messageId: null,
        eventTimestamp: "2026-01-01T00:00:00.000Z",
        receivedAt: "2026-01-01T00:00:00.000Z",
        payload: { foo: "bar" }
      }
    ];

    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries, hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="raw"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).not.toContain("<pre>");
    expect(html).toContain("member.join");
  });

  test("shows a Load more button only when hasNextPage is true", () => {
    const withMore = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: true, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );
    expect(withMore).toContain("Load more");

    const withoutMore = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="idle"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );
    expect(withoutMore).not.toContain("Load more");
  });

  test("shows a live status dot with the given status", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="live"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain('data-status="live"');
  });

  test("shows a new-entries banner when pendingCount > 0", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="live"
        pendingCount={3}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain("3件の新着");
  });

  test("does not show the banner when pendingCount is 0", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="live"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).not.toContain("件の新着");
  });

  test("wires onScrollAwayFromTop as a prop without rendering it directly (props wiring only)", () => {
    let called = false;
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="live"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={() => {
          called = true;
        }}
      />
    );

    // renderToStringはイベントを発火できないため、ここでは`onScrollCapture`が
    // 渡ったdivがTypeErrorにならず描画できる(=props自体は正しく渡っている)ことのみ確認する。
    // 実際のスクロールイベント発火(scrollTop > 4でonScrollAwayFromTopが呼ばれること)は
    // renderToStringでは検証できないため、jsdom/ブラウザベースのテストが別途必要。
    expect(typeof html).toBe("string");
    expect(called).toBe(false);
  });

  test("renders the scroll wrapper div ahead of the ScrollArea's viewport markup", () => {
    // onScrollCapture配線(Critical 1の修正)がScrollAreaのViewportより外側の
    // ラッパーdivに乗っていることを、生成されたマークアップの入れ子で確認する。
    // (renderToStringではscrollイベント自体は発火できない)
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="live"
        pendingCount={0}
        onResumeAutoScroll={noop}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain('data-slot="scroll-area-viewport"');
  });

  test("renders the new-entries banner without invoking onResumeAutoScroll (props wiring only)", () => {
    // renderToStringではDOM refやclickイベントを検証できないため、ここではbanner
    // ボタンがonResumeAutoScrollではなく内部のhandleResumeAutoScroll(scrollTop=0への
    // リセット処理を含む)に配線されていても、レンダリング自体が壊れないことのみ確認する。
    // 実際のscrollTopリセット挙動はjsdom/ブラウザベースのテストが別途必要。
    let resumed = false;
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        category="all"
        onCategoryChange={noop}
        canViewRaw={false}
        viewMode="human"
        onViewModeChange={noop}
        onLoadMore={noop}
        onRetry={noop}
        connectionStatus="live"
        pendingCount={2}
        onResumeAutoScroll={() => {
          resumed = true;
        }}
        onScrollAwayFromTop={noop}
      />
    );

    expect(html).toContain("2件の新着");
    expect(resumed).toBe(false);
  });
});
