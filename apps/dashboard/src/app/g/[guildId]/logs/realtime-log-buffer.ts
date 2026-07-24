import { LOG_CATEGORIES, categoryForEventName, type LogCategory } from "@sm-bot/shared";

import type { LogEntryData } from "./logs-view";

const MAX_BUFFER = 200;

export type PendingCountByCategory = Record<LogCategory, number>;

export interface RealtimeLogBufferState {
  displayed: LogEntryData[];
  pending: LogEntryData[];
  pendingCountByCategory: PendingCountByCategory;
  paused: boolean;
}

function emptyPendingCountByCategory(): PendingCountByCategory {
  const counts = {} as PendingCountByCategory;
  for (const category of LOG_CATEGORIES) {
    counts[category] = 0;
  }
  return counts;
}

export function createInitialRealtimeLogBufferState(): RealtimeLogBufferState {
  return { displayed: [], pending: [], pendingCountByCategory: emptyPendingCountByCategory(), paused: false };
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

// "all"は全件、それ以外はcategoryForEventNameが一致した件数のみ加算する。
function addToPendingCountByCategory(
  counts: PendingCountByCategory,
  newEntries: LogEntryData[]
): PendingCountByCategory {
  if (newEntries.length === 0) {
    return counts;
  }

  const next = { ...counts };
  for (const entry of newEntries) {
    next.all += 1;
    const category = categoryForEventName(entry.eventName);
    if (category) {
      next[category] += 1;
    }
  }
  return next;
}

export function applyIncomingRealtimeLogs(
  state: RealtimeLogBufferState,
  incoming: LogEntryData[]
): RealtimeLogBufferState {
  if (incoming.length === 0) {
    return state;
  }

  if (state.paused) {
    // 新着件数バナー(pendingCount)はカテゴリ別カウンタで別管理し、pending配列自体は
    // displayedと同じくMAX_BUFFERで切り詰める(無制限保持によるメモリ増加を防ぐ)。
    const existingIds = new Set(state.pending.map((entry) => entry.id));
    const newEntries = incoming.filter((entry) => !existingIds.has(entry.id));
    return {
      ...state,
      pending: dedupeById([...incoming, ...state.pending]).slice(0, MAX_BUFFER),
      pendingCountByCategory: addToPendingCountByCategory(state.pendingCountByCategory, newEntries)
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
    pendingCountByCategory: emptyPendingCountByCategory(),
    displayed: dedupeById([...state.pending, ...state.displayed]).slice(0, MAX_BUFFER)
  };
}
