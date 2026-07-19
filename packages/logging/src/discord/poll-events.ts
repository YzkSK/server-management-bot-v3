import type { NormalizedEvent } from "@sm-bot/shared";
import type { PartialPollAnswer, PollAnswer } from "discord.js";

function pollEventGuildId(answer: PollAnswer | PartialPollAnswer): string | null {
  const message = answer.poll?.message;
  return message?.inGuild() ? message.guildId : null;
}

export function normalizePollVote(
  answer: PollAnswer | PartialPollAnswer,
  userId: string
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "message.poll.vote",
    eventTimestamp: now,
    receivedAt: now,
    guildId: pollEventGuildId(answer),
    actorId: userId,
    channelId: answer.poll.channelId,
    messageId: answer.poll.messageId,
    payload: {
      messageId: answer.poll.messageId,
      channelId: answer.poll.channelId,
      answerId: answer.id,
      userId
    }
  };
}

export function normalizePollUnvote(
  answer: PollAnswer | PartialPollAnswer,
  userId: string
): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "message.poll.unvote",
    eventTimestamp: now,
    receivedAt: now,
    guildId: pollEventGuildId(answer),
    actorId: userId,
    channelId: answer.poll.channelId,
    messageId: answer.poll.messageId,
    payload: {
      messageId: answer.poll.messageId,
      channelId: answer.poll.channelId,
      answerId: answer.id,
      userId
    }
  };
}
