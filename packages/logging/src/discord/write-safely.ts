import type { NormalizedEvent } from "@sm-bot/shared";

export interface WriteLogEventDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export async function writeSafely(
  deps: WriteLogEventDeps,
  event: NormalizedEvent,
  source: string
): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error(`${source}: failed to write log event`, {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
