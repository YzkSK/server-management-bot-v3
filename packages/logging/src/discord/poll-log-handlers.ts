import type { NormalizedEvent } from "@sm-bot/shared";
import type { PartialPollAnswer, PollAnswer } from "discord.js";

import { normalizePollUnvote, normalizePollVote } from "./poll-events.js";

export interface PollLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface PollLogHandlers {
  onPollVoteAdd: (answer: PollAnswer | PartialPollAnswer, userId: string) => Promise<void>;
  onPollVoteRemove: (answer: PollAnswer | PartialPollAnswer, userId: string) => Promise<void>;
}

export function createPollLogHandlers(deps: PollLogHandlerDeps): PollLogHandlers {
  return {
    async onPollVoteAdd(answer, userId) {
      await writeSafely(deps, normalizePollVote(answer, userId));
    },

    async onPollVoteRemove(answer, userId) {
      await writeSafely(deps, normalizePollUnvote(answer, userId));
    }
  };
}

async function writeSafely(deps: PollLogHandlerDeps, event: NormalizedEvent): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("poll-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
