import { useEffect, useRef, useState } from "react";

import { LOG_CATEGORIES, type LogCategory } from "@sm-bot/shared";

import { Button } from "../../../../components/ui/button";
import { ScrollArea } from "../../../../components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import type { RealtimeConnectionStatus } from "./realtime-connection-status";

const CONNECTION_STATUS_DOT_CLASSES: Record<RealtimeConnectionStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-amber-500",
  live: "bg-emerald-500",
  offline: "bg-muted-foreground",
  error: "bg-destructive"
};

const CONNECTION_STATUS_LABELS: Record<RealtimeConnectionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  live: "Live",
  offline: "Offline",
  error: "Error"
};

export interface LogEntryData {
  id: string;
  eventName: string;
  actorId: string | null;
  channelId: string | null;
  messageId: string | null;
  eventTimestamp: string;
  receivedAt: string;
  payload: Record<string, unknown> | null;
}

export type LogsPageState =
  | { kind: "loading" }
  | { kind: "error"; message: string; isRetrying: boolean }
  | {
      kind: "loaded";
      entries: LogEntryData[];
      hasNextPage: boolean;
      isFetchingNextPage: boolean;
    };

const CATEGORY_LABELS: Record<LogCategory, string> = {
  all: "All",
  message: "Message",
  member: "Member",
  audit: "Audit",
  voice: "Voice",
  temp_vc: "Temp VC",
  recruitment: "Recruitment",
  tts: "TTS",
  system: "System",
  dashboard: "Dashboard"
};

export function LogsPageView({
  state,
  category,
  onCategoryChange,
  canViewRaw,
  viewMode,
  onViewModeChange,
  onLoadMore,
  onRetry,
  connectionStatus,
  pendingCount,
  onResumeAutoScroll,
  onScrollAwayFromTop
}: {
  state: LogsPageState;
  category: LogCategory;
  onCategoryChange: (category: LogCategory) => void;
  canViewRaw: boolean;
  viewMode: "human" | "raw";
  onViewModeChange: (mode: "human" | "raw") => void;
  onLoadMore: () => void;
  onRetry: () => void;
  connectionStatus: RealtimeConnectionStatus;
  pendingCount: number;
  onResumeAutoScroll: () => void;
  onScrollAwayFromTop: () => void;
}) {
  const effectiveViewMode = canViewRaw ? viewMode : "human";
  const scrollWrapperRef = useRef<HTMLDivElement>(null);

  function handleResumeAutoScroll() {
    const viewport = scrollWrapperRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (viewport) viewport.scrollTop = 0;
    onResumeAutoScroll();
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={category} onValueChange={(next) => onCategoryChange(next as LogCategory)}>
          <TabsList>
            {LOG_CATEGORIES.map((c) => (
              <TabsTrigger key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {canViewRaw ? (
            <div role="group" aria-label="View mode" className="flex items-center gap-1.5">
              <Button
                type="button"
                variant={viewMode === "human" ? "default" : "outline"}
                size="sm"
                aria-pressed={viewMode === "human"}
                onClick={() => onViewModeChange("human")}
              >
                Human View
              </Button>
              <Button
                type="button"
                variant={viewMode === "raw" ? "default" : "outline"}
                size="sm"
                aria-pressed={viewMode === "raw"}
                onClick={() => onViewModeChange("raw")}
              >
                Raw JSON
              </Button>
            </div>
          ) : null}

          <span
            data-status={connectionStatus}
            aria-label={`Realtime status: ${connectionStatus}`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span className="relative flex size-2">
              {connectionStatus === "live" ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              ) : null}
              <span
                className={`relative inline-flex size-2 rounded-full ${CONNECTION_STATUS_DOT_CLASSES[connectionStatus]}`}
              />
            </span>
            {CONNECTION_STATUS_LABELS[connectionStatus]}
          </span>
        </div>
      </div>

      {state.kind === "loading" ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {state.kind === "error" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">ログの取得に失敗しました。</p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={state.isRetrying}>
              {state.isRetrying ? "再試行中…" : "再試行"}
            </Button>
          </div>
        </div>
      ) : null}
      {state.kind === "loaded" ? (
        <>
          {pendingCount > 0 ? (
            <div className="flex justify-center">
              <Button type="button" variant="secondary" size="sm" onClick={handleResumeAutoScroll}>
                {`${pendingCount}件の新着 ↑`}
              </Button>
            </div>
          ) : null}
          <div
            ref={scrollWrapperRef}
            className="h-[60vh] rounded-lg border"
            onScrollCapture={(e) => {
              const scrollTop = (e.target as HTMLElement).scrollTop;
              if (scrollTop > 4) onScrollAwayFromTop();
            }}
          >
            <ScrollArea className="h-full">
              <ul className="divide-y">
                {state.entries.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <LogEntryRow entry={entry} viewMode={effectiveViewMode} />
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
          {state.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={state.isFetchingNextPage}
              >
                {state.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LogEntryRow({
  entry,
  viewMode
}: {
  entry: LogEntryData;
  viewMode: "human" | "raw";
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <ReceivedAtLabel receivedAt={entry.receivedAt} />
        <span className="font-mono">{entry.eventName}</span>
      </div>
      {viewMode === "raw" && entry.payload !== null ? (
        <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      ) : (
        <HumanSummary entry={entry} />
      )}
    </div>
  );
}

// サーバー/クライアントでロケール・タイムゾーンが異なるとtoLocaleString()の
// 結果が食い違いhydration mismatchが起きるため、マウント後にのみローカライズ表示へ切り替える。
function ReceivedAtLabel({ receivedAt }: { receivedAt: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <time dateTime={receivedAt}>{mounted ? new Date(receivedAt).toLocaleString() : receivedAt}</time>
  );
}

function HumanSummary({ entry }: { entry: LogEntryData }) {
  const parts = [entry.eventName];
  if (entry.actorId) parts.push(`actor:${entry.actorId}`);
  if (entry.channelId) parts.push(`channel:${entry.channelId}`);
  return <span className="text-foreground">{parts.join(" ")}</span>;
}
