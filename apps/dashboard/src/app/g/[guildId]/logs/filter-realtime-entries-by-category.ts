import { categoryForEventName, type LogCategory } from "@sm-bot/shared";

import type { LogEntryData } from "./logs-view";

// 表示中カテゴリタブに合わないrealtimeイベントを除外する。
// "all"タブでは全カテゴリを表示する。
export function filterRealtimeEntriesByCategory(
  entries: LogEntryData[],
  category: LogCategory
): LogEntryData[] {
  if (category === "all") {
    return entries;
  }
  return entries.filter((entry) => categoryForEventName(entry.eventName) === category);
}
