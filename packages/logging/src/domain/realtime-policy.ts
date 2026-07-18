import { realtimeDefaultEnabledEvents } from "@sm-bot/shared";

const realtimeEnabledEventSet = new Set<string>(realtimeDefaultEnabledEvents);

export interface ResolveRealtimeEnabledOptions {
  override?: boolean;
}

export function resolveRealtimeEnabled(
  eventName: string,
  options: ResolveRealtimeEnabledOptions = {}
): boolean {
  if (typeof options.override === "boolean") {
    return options.override;
  }

  return realtimeEnabledEventSet.has(eventName);
}
