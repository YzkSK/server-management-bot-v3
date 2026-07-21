import type { NormalizedEvent } from "@sm-bot/shared";
import type { AutoModerationActionExecution, AutoModerationRule } from "discord.js";

import {
  normalizeAutoModAction,
  normalizeAutoModRuleCreate,
  normalizeAutoModRuleDelete,
  normalizeAutoModRuleUpdate
} from "./automod-events.js";
import { writeSafely } from "./write-safely.js";

export interface AutoModLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface AutoModLogHandlers {
  onRuleCreate: (rule: AutoModerationRule) => Promise<void>;
  onRuleUpdate: (oldRule: AutoModerationRule | null, newRule: AutoModerationRule) => Promise<void>;
  onRuleDelete: (rule: AutoModerationRule) => Promise<void>;
  onActionExecution: (execution: AutoModerationActionExecution) => Promise<void>;
}

export function createAutoModLogHandlers(deps: AutoModLogHandlerDeps): AutoModLogHandlers {
  return {
    async onRuleCreate(rule) {
      await writeSafely(deps, normalizeAutoModRuleCreate(rule), "automod-log-handlers");
    },

    async onRuleUpdate(oldRule, newRule) {
      await writeSafely(deps, normalizeAutoModRuleUpdate(oldRule, newRule), "automod-log-handlers");
    },

    async onRuleDelete(rule) {
      await writeSafely(deps, normalizeAutoModRuleDelete(rule), "automod-log-handlers");
    },

    async onActionExecution(execution) {
      await writeSafely(deps, normalizeAutoModAction(execution), "automod-log-handlers");
    }
  };
}
