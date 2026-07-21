import type { NormalizedEvent } from "@sm-bot/shared";
import type { StageInstance } from "discord.js";

import {
  normalizeStageCreate,
  normalizeStageDelete,
  normalizeStageUpdate
} from "./stage-events.js";
import { writeSafely } from "./write-safely.js";

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
      await writeSafely(deps, normalizeStageCreate(stage), "stage-log-handlers");
    },

    async onStageUpdate(oldStage, newStage) {
      await writeSafely(deps, normalizeStageUpdate(oldStage, newStage), "stage-log-handlers");
    },

    async onStageDelete(stage) {
      await writeSafely(deps, normalizeStageDelete(stage), "stage-log-handlers");
    }
  };
}
