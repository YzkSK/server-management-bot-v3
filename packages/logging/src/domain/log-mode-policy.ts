import type { GuildLogMode } from "@sm-bot/db";
import type { NormalizedEvent } from "@sm-bot/shared";

// イベントごとの本文フィールド名。metadata_only時はここに列挙したキーのみ除去する。
const MESSAGE_CONTENT_FIELDS: Record<string, readonly string[]> = {
  "message.create": ["content"],
  "message.update": ["oldContent", "newContent"],
  "message.delete": ["content"]
};

// message系イベントは本文(content)を保持しDB肥大化の主因となるため、
// guildConfigs.logModeによる保存モード切り替えの対象はこのカテゴリに限定する。
const MESSAGE_CONTENT_EVENT_NAMES = new Set<string>(Object.keys(MESSAGE_CONTENT_FIELDS));

export type LogWriteAction = "write-full" | "write-metadata-only" | "skip";

export function isLogModeControlledEvent(eventName: string): boolean {
  return MESSAGE_CONTENT_EVENT_NAMES.has(eventName);
}

export function resolveLogWriteAction(
  eventName: string,
  logMode: GuildLogMode
): LogWriteAction {
  if (!isLogModeControlledEvent(eventName)) {
    return "write-full";
  }

  if (logMode === "full") {
    return "write-full";
  }

  if (logMode === "metadata_only") {
    return "write-metadata-only";
  }

  return "skip";
}

export function stripMessageContent(event: NormalizedEvent): NormalizedEvent {
  const contentFields = MESSAGE_CONTENT_FIELDS[event.eventName];
  if (!contentFields) {
    return event;
  }

  const payload = { ...event.payload };
  for (const field of contentFields) {
    delete payload[field];
  }

  return { ...event, payload };
}
