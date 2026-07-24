import { useEffect, useState } from "react";

import { LOG_CATEGORIES, type LogCategory } from "@sm-bot/shared";

import { ScrollArea } from "../../../../components/ui/scroll-area";

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
  onRetry
}: {
  state: LogsPageState;
  category: LogCategory;
  onCategoryChange: (category: LogCategory) => void;
  canViewRaw: boolean;
  viewMode: "human" | "raw";
  onViewModeChange: (mode: "human" | "raw") => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const effectiveViewMode = canViewRaw ? viewMode : "human";

  return (
    <div>
      <div role="group" aria-label="Log category">
        {LOG_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => onCategoryChange(c)}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

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
      {state.kind === "error" ? (
        <div>
          <p>ログの取得に失敗しました。</p>
          <button type="button" onClick={onRetry} disabled={state.isRetrying}>
            {state.isRetrying ? "再試行中…" : "再試行"}
          </button>
        </div>
      ) : null}
      {state.kind === "loaded" ? (
        <>
          <ScrollArea>
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
      <ReceivedAtLabel receivedAt={entry.receivedAt} />{" "}
      <span>{entry.eventName}</span>
      {viewMode === "raw" && entry.payload !== null ? (
        <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
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
  return <span>{parts.join(" ")}</span>;
}
