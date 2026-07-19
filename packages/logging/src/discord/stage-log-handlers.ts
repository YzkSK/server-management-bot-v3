import type { NormalizedEvent } from "@sm-bot/shared";
import type { StageInstance } from "discord.js";

import {
  normalizeStageCreate,
  normalizeStageDelete,
  normalizeStageUpdate
} from "./stage-events.js";

export interface StageLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface StageLogHandlers {
  onStageCreate: (stage: StageInstance) => Promise<void>;
  onStageUpdate: (oldStage: StageInstance | null, newStage: StageInstance) => Promise<void>;
  onStageDelete: (stage: StageInstance) => Promise<void>;
}

export function createStageLogHandlers(deps: StageLogHandlerDeps): StageLogHandlers {
  return {
    async onStageCreate(stage) {
      await writeSafely(deps, normalizeStageCreate(stage));
    },

    async onStageUpdate(oldStage, newStage) {
      await writeSafely(deps, normalizeStageUpdate(oldStage, newStage));
    },

    async onStageDelete(stage) {
      await writeSafely(deps, normalizeStageDelete(stage));
    }
  };
}

async function writeSafely(deps: StageLogHandlerDeps, event: NormalizedEvent): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("stage-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
