import type { NormalizedEvent } from "@sm-bot/shared";
import type { PartialPollAnswer, PollAnswer } from "discord.js";

import { normalizePollUnvote, normalizePollVote } from "./poll-events.js";
import { writeSafely } from "./write-safely.js";

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
      await writeSafely(deps, normalizePollVote(answer, userId), "poll-log-handlers");
    },

    async onPollVoteRemove(answer, userId) {
      await writeSafely(deps, normalizePollUnvote(answer, userId), "poll-log-handlers");
    }
  };
}
