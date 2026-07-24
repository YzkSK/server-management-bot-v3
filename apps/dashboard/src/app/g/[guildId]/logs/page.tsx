"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { CAP, type LogCategory } from "@sm-bot/shared";

import { useCapability } from "../../../../lib/use-capability";
import { trpc } from "../../../../trpc-client";
import { filterRealtimeEntriesByCategory } from "./filter-realtime-entries-by-category";
import { LogsPageView, type LogEntryData, type LogsPageState } from "./logs-view";
import { useRealtimeLogs } from "./use-realtime-logs";

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

// realtimeエントリとページネーション済みエントリをid基準でdedupeしつつ結合する。
// realtimeエントリを優先(先勝ち)して残す。
// 注: 現状はRedis Stream IDとDB行UUIDが別ID空間のため実質dedupeされないが、
// サーバー側のID整合(別issue)が入れば自動的に効くようになる。
export function mergeEntriesById(
  realtimeEntries: LogEntryData[],
  paginatedEntries: LogEntryData[]
): LogEntryData[] {
  const seen = new Set<string>();
  const result: LogEntryData[] = [];
  for (const entry of [...realtimeEntries, ...paginatedEntries]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

export default function GuildLogsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [category, setCategory] = useState<LogCategory>("all");
  const [viewMode, setViewMode] = useState<"human" | "raw">("human");
  const canViewRaw = useCapability(CAP.VIEW_LOGS_RAW);
  const realtime = useRealtimeLogs(guildId, category);

  const query = trpc.logs.list.useInfiniteQuery(
    { category, limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined }
  );

  const baseState = deriveLogsPageState(query);
  const filteredRealtimeEntries = filterRealtimeEntriesByCategory(realtime.displayed, category);
  const state: LogsPageState =
    baseState.kind === "loaded"
      ? { ...baseState, entries: mergeEntriesById(filteredRealtimeEntries, baseState.entries) }
      : baseState;

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
      connectionStatus={realtime.status}
      pendingCount={realtime.pendingCount}
      onResumeAutoScroll={() => realtime.setPaused(false)}
      onScrollAwayFromTop={() => realtime.setPaused(true)}
    />
  );
}
