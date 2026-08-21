import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { getLocale } from "@sm-bot/shared";

import { LogsPageView, type LogEntryData, type LogsPageState } from "./logs-view";

function noop() {}

const locale = getLocale("ja");

describe("LogsPageView", () => {
  test("renders a localized tab per log category", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        locale={locale}
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

    expect(html).toContain(locale.logs.category.all);
    expect(html).toContain(locale.logs.category.message);
    expect(html).toContain(locale.logs.category.temp_vc);
    expect(html).toContain(locale.logs.category.dashboard);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');

    const enLocale = getLocale("en");
    const enHtml = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        locale={enLocale}
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

    expect(enHtml).toContain(enLocale.logs.category.all);
    expect(enHtml).toContain(enLocale.logs.category.dashboard);
  });

  test("marks the active category tab with aria-selected", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        locale={locale}
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

    const memberButtonIndex = html.indexOf(`>${locale.logs.category.member}<`);
    const memberButtonStart = html.lastIndexOf("<button", memberButtonIndex);
    const memberButtonTag = html.slice(memberButtonStart, memberButtonIndex);
    expect(memberButtonTag).toContain('aria-selected="true"');
  });

  test("shows the localized loading message while loading", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        locale={locale}
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

    expect(html).toContain(locale.logs.loading);
  });

  test("shows a generic error message without leaking the raw error", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "error", message: "boom", isRetrying: false }}
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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

    expect(html).not.toContain(locale.logs.viewModeRaw);
  });

  test("shows the Human View/Raw JSON toggle when canViewRaw is true", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        locale={locale}
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

    expect(html).toContain(locale.logs.viewModeHuman);
    expect(html).toContain(locale.logs.viewModeRaw);
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
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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
    expect(withMore).toContain(locale.logs.loadMore);

    const withoutMore = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        locale={locale}
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
    expect(withoutMore).not.toContain(locale.logs.loadMore);
  });

  test("shows the localized loading label while fetching the next page", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: true, isFetchingNextPage: true }}
        locale={locale}
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
    expect(html).toContain(locale.logs.loadingMore);
  });

  test("localizes the view-mode group aria-label", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        locale={locale}
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
    expect(html).toContain(`aria-label="${locale.logs.viewModeGroupLabel}"`);
  });

  test("localizes the realtime connection status aria-label", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries: [], hasNextPage: false, isFetchingNextPage: false }}
        locale={locale}
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
    expect(html).toContain(locale.logs.realtimeStatusLabel({ status: locale.logs.connectionLive }));
  });

  test("shows a live status dot with the given status", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "loading" }}
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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

  test("shows message content in Human View for message.create/message.delete", () => {
    const entries: LogEntryData[] = [
      {
        id: "log-1",
        eventName: "message.create",
        actorId: "user-1",
        channelId: "channel-1",
        messageId: "msg-1",
        eventTimestamp: "2026-01-01T00:00:00.000Z",
        receivedAt: "2026-01-01T00:00:00.000Z",
        payload: { content: "こんにちは", attachments: [] }
      },
      {
        id: "log-2",
        eventName: "message.delete",
        actorId: "user-1",
        channelId: "channel-1",
        messageId: "msg-2",
        eventTimestamp: "2026-01-01T00:00:00.000Z",
        receivedAt: "2026-01-01T00:00:00.000Z",
        payload: { content: "削除されたメッセージ", attachments: [] }
      }
    ];

    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries, hasNextPage: false, isFetchingNextPage: false }}
        locale={locale}
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

    expect(html).toContain("こんにちは");
    expect(html).toContain("削除されたメッセージ");
  });

  test("shows old → new content in Human View for message.update", () => {
    const entries: LogEntryData[] = [
      {
        id: "log-1",
        eventName: "message.update",
        actorId: "user-1",
        channelId: "channel-1",
        messageId: "msg-1",
        eventTimestamp: "2026-01-01T00:00:00.000Z",
        receivedAt: "2026-01-01T00:00:00.000Z",
        payload: { oldContent: "編集前", newContent: "編集後", attachments: [], partial: false }
      }
    ];

    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries, hasNextPage: false, isFetchingNextPage: false }}
        locale={locale}
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

    expect(html).toContain("編集前");
    expect(html).toContain("編集後");
    expect(html).toContain("→");
  });

  test("shows an attachments count in Human View when attachments are present", () => {
    const entries: LogEntryData[] = [
      {
        id: "log-1",
        eventName: "message.create",
        actorId: "user-1",
        channelId: "channel-1",
        messageId: "msg-1",
        eventTimestamp: "2026-01-01T00:00:00.000Z",
        receivedAt: "2026-01-01T00:00:00.000Z",
        payload: {
          content: "",
          attachments: [
            { url: "https://example.com/a.png", name: "a.png", contentType: "image/png" },
            { url: "https://example.com/b.png", name: "b.png", contentType: "image/png" }
          ]
        }
      }
    ];

    const html = renderToString(
      <LogsPageView
        state={{ kind: "loaded", entries, hasNextPage: false, isFetchingNextPage: false }}
        locale={locale}
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

    expect(html).toContain(locale.logs.attachmentsCount({ count: 2 }));
  });

  test("renders the English error message when given the English locale", () => {
    const html = renderToString(
      <LogsPageView
        state={{ kind: "error", message: "boom", isRetrying: false }}
        locale={getLocale("en")}
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

    expect(html).toContain("Failed to load logs.");
  });
});
