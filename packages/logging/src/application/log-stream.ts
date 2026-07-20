import {
  type NormalizedEvent,
  normalizedEventSchema
} from "@sm-bot/shared";

export const LOGS_STREAM_KEY = "logs:events";
export const REALTIME_LOGS_STREAM_PREFIX = "rt:logs:";

export interface AppendLogEventOptions {
  realtimeEnabled?: boolean;
}

export interface LogStreamFields extends Record<string, string> {
  event_name: string;
  guild_id: string;
  actor_id: string;
  channel_id: string;
  message_id: string;
  event_timestamp: string;
  received_at: string;
  realtime_enabled: string;
  payload: string;
}

export interface RedisStreamWriter {
  xAdd: (
    key: string,
    id: "*",
    fields: Record<string, string>
  ) => Promise<string | null>;
}

export interface RedisStreamMessage {
  id: string;
  message: Record<string, string>;
}

export async function appendLogEventToStream(
  redis: RedisStreamWriter,
  event: NormalizedEvent,
  options: AppendLogEventOptions = {}
) {
  return redis.xAdd(LOGS_STREAM_KEY, "*", toLogStreamFields(event, options));
}

export async function appendRealtimeLogEventToStream(
  redis: RedisStreamWriter,
  event: NormalizedEvent,
  options: AppendLogEventOptions = {}
) {
  if (!event.guildId) {
    return null;
  }

  return redis.xAdd(
    `${REALTIME_LOGS_STREAM_PREFIX}${event.guildId}`,
    "*",
    toLogStreamFields(event, options)
  );
}

export function toLogStreamFields(
  event: NormalizedEvent,
  options: AppendLogEventOptions = {}
): LogStreamFields {
  const parsedEvent = normalizedEventSchema.parse(event);

  return {
    event_name: parsedEvent.eventName,
    guild_id: parsedEvent.guildId ?? "",
    actor_id: parsedEvent.actorId ?? "",
    channel_id: parsedEvent.channelId ?? "",
    message_id: parsedEvent.messageId ?? "",
    event_timestamp: parsedEvent.eventTimestamp.toISOString(),
    received_at: parsedEvent.receivedAt.toISOString(),
    realtime_enabled: options.realtimeEnabled === true ? "1" : "0",
    payload: JSON.stringify(parsedEvent.payload)
  };
}

export function toRealtimeLogMessage(message: RedisStreamMessage) {
  return {
    id: message.id,
    eventName: message.message.event_name ?? "",
    guildId: emptyToNull(message.message.guild_id),
    actorId: emptyToNull(message.message.actor_id),
    channelId: emptyToNull(message.message.channel_id),
    messageId: emptyToNull(message.message.message_id),
    eventTimestamp: message.message.event_timestamp
      ? new Date(message.message.event_timestamp)
      : new Date(0),
    receivedAt: message.message.received_at
      ? new Date(message.message.received_at)
      : new Date(0),
    realtimeEnabled: message.message.realtime_enabled === "1",
    payload: parsePayload(message.message.payload)
  };
}

function emptyToNull(value: string | undefined) {
  return value ? value : null;
}

function parsePayload(value: string | undefined) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (err) {
    console.warn("log-stream: failed to parse payload JSON", { value, err });
    return {};
  }
}
