"use client";

import { useState } from "react";

import { CAP, type LogCategory } from "@sm-bot/shared";

import { useCapability } from "../../../../lib/use-capability";
import { trpc } from "../../../../trpc-client";
import { LogsPageView, type LogEntryData, type LogsPageState } from "./logs-view";

export interface LogsQueryResult {
  data: { pages: { items: LogEntryData[] }[] } | undefined;
  error: { message: string } | null;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  isFetching: boolean;
}

// dataが一度でも取得済みなら、以降のfetchNextPage失敗(query.error)は
// 既存一覧を消さずloaded状態のまま保持する。errorは初回取得が
// 未完了の場合にのみ全体エラー表示に反映する(Load more失敗で
// 表示中のログが丸ごと消えるのを防ぐ)。
export function deriveLogsPageState(query: LogsQueryResult): LogsPageState {
  if (query.data) {
    return {
      kind: "loaded",
      entries: query.data.pages.flatMap((page) => page.items),
      hasNextPage: query.hasNextPage ?? false,
      isFetchingNextPage: query.isFetchingNextPage
    };
  }

  if (query.error) {
    return { kind: "error", message: query.error.message, isRetrying: query.isFetching };
  }

  return { kind: "loading" };
}

export default function GuildLogsPage() {
  const [category, setCategory] = useState<LogCategory>("all");
  const [viewMode, setViewMode] = useState<"human" | "raw">("human");
  const canViewRaw = useCapability(CAP.VIEW_LOGS_RAW);

  const query = trpc.logs.list.useInfiniteQuery(
    { category, limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined }
  );

  const state = deriveLogsPageState(query);

  return (
    <LogsPageView
      state={state}
      category={category}
      onCategoryChange={setCategory}
      canViewRaw={canViewRaw}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onLoadMore={() => query.fetchNextPage()}
      onRetry={() => query.refetch()}
    />
  );
}
