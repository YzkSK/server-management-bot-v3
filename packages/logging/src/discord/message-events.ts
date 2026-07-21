import type { NormalizedEvent } from "@sm-bot/shared";
import type {
  GuildTextBasedChannel,
  Message,
  PartialMessage,
  ReadonlyCollection
} from "discord.js";

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
  // partial(未キャッシュ)なメッセージはcontent/attachmentsがnull/空になるため、
  // 「変化なし」と誤判定して実際の編集を握り潰さないよう、partial時は不明として必ずログする。
  const isUncertain = oldMessage.partial === true || newMessage.partial === true;
  const contentUnchanged = !isUncertain && oldMessage.content === newMessage.content;
  const attachmentsUnchanged =
    !isUncertain &&
    attachmentUrlsEqual(attachmentPayload(oldMessage), attachmentPayload(newMessage));

  // embed unfurl: Discordは埋め込みプレビュー付与時にもMessageUpdateを発火する。
  // 本文にも添付ファイルにも変化がなければログしない(partial時はこの判定自体を行わない)。
  if (contentUnchanged && attachmentsUnchanged) {
    return null;
  }

  return {
    eventName: "message.update",
    eventTimestamp: newMessage.editedAt ?? new Date(),
    receivedAt: new Date(),
    guildId: newMessage.guildId,
    actorId: newMessage.author?.id ?? null,
    channelId: newMessage.channelId,
    messageId: newMessage.id,
    payload: {
      oldContent: oldMessage.content ?? null,
      newContent: newMessage.content ?? null,
      attachments: attachmentPayload(newMessage),
      partial: isUncertain
    }
  };
}

export function normalizeMessageDelete(message: AnyMessage): NormalizedEvent {
  return {
    eventName: "message.delete",
    eventTimestamp: new Date(),
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

/**
 * 実行者(actorId)はゲートウェイ到着時点では判定できないため、
 * message-log-handlers.tsのlookupAuditLog/applyAuditLogによる相関で
 * 補完される前提でactorId: null/reason: nullのまま正規化する。
 */
export function normalizeMessageBulkDelete(
  messages: ReadonlyCollection<string, AnyMessage>,
  channel: GuildTextBasedChannel
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "message.bulk_delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: channel.guildId,
    actorId: null,
    channelId: channel.id,
    messageId: null,
    payload: {
      messageIds: [...messages.keys()],
      count: messages.size,
      reason: null
    }
  };
}

function attachmentUrlsEqual(
  a: Array<{ url: string }>,
  b: Array<{ url: string }>
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = a.map((attachment) => attachment.url).sort();
  const sortedB = b.map((attachment) => attachment.url).sort();

  return sortedA.every((url, index) => url === sortedB[index]);
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
