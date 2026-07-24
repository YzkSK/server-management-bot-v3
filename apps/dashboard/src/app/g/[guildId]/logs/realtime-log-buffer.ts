import type { LogEntryData } from "./logs-view";

const MAX_BUFFER = 200;

export interface RealtimeLogBufferState {
  displayed: LogEntryData[];
  pending: LogEntryData[];
  paused: boolean;
}

export function createInitialRealtimeLogBufferState(): RealtimeLogBufferState {
  return { displayed: [], pending: [], paused: false };
}

function dedupeById(entries: LogEntryData[]): LogEntryData[] {
  const seen = new Set<string>();
  const result: LogEntryData[] = [];
  for (const entryItem of entries) {
    if (seen.has(entryItem.id)) continue;
    seen.add(entryItem.id);
    result.push(entryItem);
  }
  return result;
}

export function applyIncomingRealtimeLogs(
  state: RealtimeLogBufferState,
  incoming: LogEntryData[]
): RealtimeLogBufferState {
  if (incoming.length === 0) {
    return state;
  }

  if (state.paused) {
    // pendingは新着件数バナー(pendingCount)の集計元も兼ねるため、
    // 表示用のdisplayedと違いMAX_BUFFERで切り詰めない。
    return {
      ...state,
      pending: dedupeById([...incoming, ...state.pending])
    };
  }

  return {
    ...state,
    displayed: dedupeById([...incoming, ...state.displayed]).slice(0, MAX_BUFFER)
  };
}

export function setRealtimeLogsPaused(
  state: RealtimeLogBufferState,
  paused: boolean
): RealtimeLogBufferState {
  if (paused === state.paused) {
    return state;
  }

  if (paused) {
    return { ...state, paused: true };
  }

  return {
    paused: false,
    pending: [],
    displayed: dedupeById([...state.pending, ...state.displayed]).slice(0, MAX_BUFFER)
  };
}
