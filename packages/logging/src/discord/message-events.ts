import type { NormalizedEvent } from "@sm-bot/shared";
import type { Message, PartialMessage } from "discord.js";

type AnyMessage = Message | PartialMessage;

export function shouldSkipMessageLog(message: AnyMessage): boolean {
  return message.author?.bot === true;
}

export function normalizeMessageCreate(message: Message): NormalizedEvent {
  return {
    eventName: "message.create",
    eventTimestamp: message.createdAt,
    receivedAt: new Date(),
    guildId: message.guildId,
    actorId: message.author?.id ?? null,
    channelId: message.channelId,
    messageId: message.id,
    payload: {
      content: message.content ?? null,
      attachments: attachmentPayload(message)
    }
  };
}

export function normalizeMessageUpdate(
  oldMessage: AnyMessage,
  newMessage: AnyMessage
): NormalizedEvent | null {
  // embed unfurl: Discordは埋め込みプレビュー付与時にもMessageUpdateを発火する。
  // 本文が変わっていなければログしない。
  if (oldMessage.content !== null && oldMessage.content === newMessage.content) {
    return null;
  }

  return {
    eventName: "message.update",
    eventTimestamp: newMessage.editedAt ?? newMessage.createdAt ?? new Date(),
    receivedAt: new Date(),
    guildId: newMessage.guildId,
    actorId: newMessage.author?.id ?? null,
    channelId: newMessage.channelId,
    messageId: newMessage.id,
    payload: {
      oldContent: oldMessage.content ?? null,
      newContent: newMessage.content ?? null,
      attachments: attachmentPayload(newMessage)
    }
  };
}

export function normalizeMessageDelete(message: AnyMessage): NormalizedEvent {
  return {
    eventName: "message.delete",
    eventTimestamp: message.createdAt ?? new Date(),
    receivedAt: new Date(),
    guildId: message.guildId,
    actorId: message.author?.id ?? null,
    channelId: message.channelId,
    messageId: message.id,
    payload: {
      content: message.content ?? null,
      attachments: attachmentPayload(message)
    }
  };
}

function attachmentPayload(
  message: AnyMessage
): Array<{ url: string; name: string; contentType: string | null }> {
  return [...(message.attachments?.values() ?? [])]
    .filter(
      (attachment) =>
        attachment.contentType?.startsWith("image/") ||
        attachment.contentType?.startsWith("video/")
    )
    .map((attachment) => ({
      url: attachment.url,
      name: attachment.name,
      contentType: attachment.contentType ?? null
    }));
}
