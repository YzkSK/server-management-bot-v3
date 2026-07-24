import { LOG_CATEGORIES, type LogCategory } from "@sm-bot/shared";

import { ScrollArea } from "../../../../components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import type { RealtimeConnectionStatus } from "./realtime-connection-status";

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
  | { kind: "error"; message: string }
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
  connectionStatus: RealtimeConnectionStatus;
  pendingCount: number;
  onResumeAutoScroll: () => void;
  onScrollAwayFromTop: () => void;
}) {
  const effectiveViewMode = canViewRaw ? viewMode : "human";

  return (
    <div>
      <Tabs value={category} onValueChange={(next) => onCategoryChange(next as LogCategory)}>
        <TabsList>
          {LOG_CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <span data-status={connectionStatus} aria-label={`Realtime status: ${connectionStatus}`}>
        ● {connectionStatus}
      </span>

      {canViewRaw ? (
        <div role="group" aria-label="View mode">
          <button
            type="button"
            aria-pressed={viewMode === "human"}
            onClick={() => onViewModeChange("human")}
          >
            Human View
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "raw"}
            onClick={() => onViewModeChange("raw")}
          >
            Raw JSON
          </button>
        </div>
      ) : null}

      {state.kind === "loading" ? <p>Loading...</p> : null}
      {state.kind === "error" ? <p>ログの取得に失敗しました。</p> : null}
      {state.kind === "loaded" ? (
        <>
          {pendingCount > 0 ? (
            <button type="button" onClick={onResumeAutoScroll}>
              {`${pendingCount}件の新着 ↑`}
            </button>
          ) : null}
          <ScrollArea
            onScroll={(e) => {
              if (e.currentTarget.scrollTop > 4) onScrollAwayFromTop();
            }}
          >
            <ul>
              {state.entries.map((entry) => (
                <li key={entry.id}>
                  <LogEntryRow entry={entry} viewMode={effectiveViewMode} />
                </li>
              ))}
            </ul>
          </ScrollArea>
          {state.hasNextPage ? (
            <button type="button" onClick={onLoadMore} disabled={state.isFetchingNextPage}>
              {state.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
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
    <div>
      <span>{entry.receivedAt}</span>{" "}
      <span>{entry.eventName}</span>
      {viewMode === "raw" && entry.payload !== null ? (
        <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
      ) : (
        <HumanSummary entry={entry} />
      )}
    </div>
  );
}

function HumanSummary({ entry }: { entry: LogEntryData }) {
  const parts = [entry.eventName];
  if (entry.actorId) parts.push(`actor:${entry.actorId}`);
  if (entry.channelId) parts.push(`channel:${entry.channelId}`);
  return <span>{parts.join(" ")}</span>;
}
