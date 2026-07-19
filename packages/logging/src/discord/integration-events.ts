import type { NormalizedEvent } from "@sm-bot/shared";
import type { Guild } from "discord.js";

export function normalizeIntegrationUpdate(guild: Guild): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "integration.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: guild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: {}
  };
}
