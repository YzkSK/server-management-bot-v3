import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { LogsPageView, type LogEntryData, type LogsPageState } from "./logs-view";

function noop() {}

describe("LogsPageView", () => {
  test("renders a button per log category", () => {
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
      />
    );

    expect(html).toContain("All");
    expect(html).toContain("Message");
    expect(html).toContain("Temp VC");
    expect(html).toContain("Dashboard");
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain('role="tablist"');
  });

  test("marks the active category button with aria-pressed", () => {
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
      />
    );

    const memberButtonIndex = html.indexOf(">Member<");
    const memberButtonStart = html.lastIndexOf("<button", memberButtonIndex);
    const memberButtonTag = html.slice(memberButtonStart, memberButtonIndex);
    expect(memberButtonTag).toContain('aria-pressed="true"');
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
      />
    );
    expect(withoutMore).not.toContain("Load more");
  });
});
