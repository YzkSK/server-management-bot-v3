"use client";

import { useState } from "react";

import { CAP, type LogCategory } from "@sm-bot/shared";

import { useCapability } from "../../../../lib/use-capability";
import { trpc } from "../../../../trpc-client";
import { LogsPageView, type LogsPageState } from "./logs-view";

export default function GuildLogsPage() {
  const [category, setCategory] = useState<LogCategory>("all");
  const [viewMode, setViewMode] = useState<"human" | "raw">("human");
  const canViewRaw = useCapability(CAP.VIEW_LOGS_RAW);

  const query = trpc.logs.list.useInfiniteQuery(
    { category, limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined }
  );

  const state: LogsPageState = query.isLoading
    ? { kind: "loading" }
    : query.error
      ? { kind: "error", message: query.error.message }
      : {
          kind: "loaded",
          entries: query.data?.pages.flatMap((page) => page.items) ?? [],
          hasNextPage: query.hasNextPage ?? false,
          isFetchingNextPage: query.isFetchingNextPage
        };

  return (
    <LogsPageView
      state={state}
      category={category}
      onCategoryChange={setCategory}
      canViewRaw={canViewRaw}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onLoadMore={() => query.fetchNextPage()}
    />
  );
}
