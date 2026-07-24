export const LOG_CATEGORIES = [
  "all",
  "message",
  "member",
  "audit",
  "voice",
  "temp_vc",
  "recruitment",
  "tts",
  "system",
  "dashboard"
] as const;

export type LogCategory = (typeof LOG_CATEGORIES)[number];

type FilterableLogCategory = Exclude<LogCategory, "all">;

const LOG_CATEGORY_EVENT_PREFIXES: Record<FilterableLogCategory, readonly string[]> = {
  message: ["message."],
  member: ["member."],
  audit: [
    "guild.",
    "role.",
    "channel.",
    "thread.",
    "invite.",
    "emoji.",
    "sticker.",
    "webhook."
  ],
  voice: ["voice.session.", "voice.state.", "call."],
  temp_vc: ["voice.temp."],
  recruitment: ["recruitment."],
  tts: ["tts."],
  system: ["system."],
  dashboard: ["dashboard.", "config."]
};

export function eventNamePrefixesForCategory(
  category: LogCategory
): readonly string[] | null {
  if (category === "all") {
    return null;
  }

  return LOG_CATEGORY_EVENT_PREFIXES[category];
}

export function categoryForEventName(eventName: string): LogCategory | null {
  for (const category of LOG_CATEGORIES) {
    if (category === "all") continue;

    const prefixes = LOG_CATEGORY_EVENT_PREFIXES[category];
    if (prefixes.some((prefix) => eventName.startsWith(prefix))) {
      return category;
    }
  }

  return null;
}
