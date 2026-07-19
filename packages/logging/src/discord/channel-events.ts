import type { NormalizedEvent } from "@sm-bot/shared";
import type { DMChannel, NonThreadGuildBasedChannel } from "discord.js";

import { channelPayload, channelPermissionOverwritesPayload, diffRecord } from "./payloads.js";

export function isGuildChannel(
  channel: DMChannel | NonThreadGuildBasedChannel
): channel is NonThreadGuildBasedChannel {
  return "guildId" in channel;
}

export function normalizeChannelCreate(channel: NonThreadGuildBasedChannel): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "channel.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: channel.guildId,
    actorId: null,
    channelId: channel.id,
    messageId: null,
    payload: { channel: channelPayload(channel) }
  };
}

export function normalizeChannelDelete(channel: NonThreadGuildBasedChannel): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "channel.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: channel.guildId,
    actorId: null,
    channelId: channel.id,
    messageId: null,
    payload: { channel: channelPayload(channel) }
  };
}

export function normalizeChannelUpdate(
  oldChannel: NonThreadGuildBasedChannel,
  newChannel: NonThreadGuildBasedChannel
): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  const now = new Date();

  const beforeOverwrites = overwritesRecord(channelPermissionOverwritesPayload(oldChannel));
  const afterOverwrites = overwritesRecord(channelPermissionOverwritesPayload(newChannel));
  const overwriteChanges = diffRecord(beforeOverwrites, afterOverwrites);

  const beforeProps = withoutOverwrites(channelPayload(oldChannel));
  const afterProps = withoutOverwrites(channelPayload(newChannel));
  const propChanges = diffRecord(beforeProps, afterProps);

  if (Object.keys(propChanges).length > 0) {
    events.push({
      eventName: "channel.update",
      eventTimestamp: now,
      receivedAt: now,
      guildId: newChannel.guildId,
      actorId: null,
      channelId: newChannel.id,
      messageId: null,
      payload: { before: beforeProps, after: afterProps, changes: propChanges }
    });
  }

  if (Object.keys(overwriteChanges).length > 0) {
    events.push({
      eventName: "channel.permission_update",
      eventTimestamp: now,
      receivedAt: now,
      guildId: newChannel.guildId,
      actorId: null,
      channelId: newChannel.id,
      messageId: null,
      payload: { before: beforeOverwrites, after: afterOverwrites, changes: overwriteChanges }
    });
  }

  return events;
}

function withoutOverwrites(
  payload: ReturnType<typeof channelPayload>
): Record<string, unknown> {
  const { permissionOverwrites: _permissionOverwrites, ...rest } = payload;
  return rest;
}

function overwritesRecord(
  overwrites: ReturnType<typeof channelPermissionOverwritesPayload>
): Record<string, unknown> {
  return Object.fromEntries(overwrites.map((overwrite) => [overwrite.id, overwrite]));
}

export function normalizeWebhookUpdate(channel: NonThreadGuildBasedChannel): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "webhook.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: channel.guildId,
    actorId: null,
    channelId: channel.id,
    messageId: null,
    payload: { channel: channelPayload(channel) }
  };
}
