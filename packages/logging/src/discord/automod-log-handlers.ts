import type { NormalizedEvent } from "@sm-bot/shared";
import type { AutoModerationActionExecution, AutoModerationRule } from "discord.js";

import {
  normalizeAutoModAction,
  normalizeAutoModRuleCreate,
  normalizeAutoModRuleDelete,
  normalizeAutoModRuleUpdate
} from "./automod-events.js";

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
      await writeSafely(deps, normalizeAutoModRuleCreate(rule));
    },

    async onRuleUpdate(oldRule, newRule) {
      await writeSafely(deps, normalizeAutoModRuleUpdate(oldRule, newRule));
    },

    async onRuleDelete(rule) {
      await writeSafely(deps, normalizeAutoModRuleDelete(rule));
    },

    async onActionExecution(execution) {
      await writeSafely(deps, normalizeAutoModAction(execution));
    }
  };
}

async function writeSafely(deps: AutoModLogHandlerDeps, event: NormalizedEvent): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("automod-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
