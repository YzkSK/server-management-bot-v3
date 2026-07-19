import type { NormalizedEvent } from "@sm-bot/shared";
import type { Guild } from "discord.js";

import { diffRecord, guildPayload } from "./payloads.js";

export function normalizeGuildUpdate(oldGuild: Guild, newGuild: Guild): NormalizedEvent | null {
  const before = guildPayload(oldGuild);
  const after = guildPayload(newGuild);
  const changes = diffRecord(before, after);

  if (Object.keys(changes).length === 0) {
    return null;
  }

  const now = new Date();
  return {
    eventName: "guild.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newGuild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { before, after, changes }
  };
}
