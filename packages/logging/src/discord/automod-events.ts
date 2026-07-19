import type { NormalizedEvent } from "@sm-bot/shared";
import type { AutoModerationActionExecution, AutoModerationRule } from "discord.js";

import { diffRecord } from "./payloads.js";

function autoModRulePayload(rule: AutoModerationRule) {
  return {
    id: rule.id,
    name: rule.name,
    creatorId: rule.creatorId,
    eventType: rule.eventType,
    triggerType: rule.triggerType,
    triggerMetadata: rule.triggerMetadata,
    actions: rule.actions.map((action) => ({ type: action.type, metadata: action.metadata })),
    enabled: rule.enabled,
    exemptRoles: [...rule.exemptRoles.keys()].sort(),
    exemptChannels: [...rule.exemptChannels.keys()].sort()
  };
}

function autoModActionPayload(execution: AutoModerationActionExecution) {
  return {
    ruleId: execution.ruleId,
    ruleTriggerType: execution.ruleTriggerType,
    userId: execution.userId,
    channelId: execution.channelId,
    messageId: execution.messageId,
    alertSystemMessageId: execution.alertSystemMessageId,
    content: execution.content,
    matchedKeyword: execution.matchedKeyword,
    matchedContent: execution.matchedContent,
    action: { type: execution.action.type, metadata: execution.action.metadata }
  };
}

export function normalizeAutoModRuleCreate(rule: AutoModerationRule): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "automod.rule.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: rule.guild.id,
    actorId: rule.creatorId,
    channelId: null,
    messageId: null,
    payload: { rule: autoModRulePayload(rule) }
  };
}

export function normalizeAutoModRuleUpdate(
  oldRule: AutoModerationRule | null,
  newRule: AutoModerationRule
): NormalizedEvent {
  const before = oldRule ? autoModRulePayload(oldRule) : null;
  const after = autoModRulePayload(newRule);
  const now = new Date();
  return {
    eventName: "automod.rule.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newRule.guild.id,
    actorId: null,
    channelId: null,
    messageId: null,
    payload: { before, after, changes: before ? diffRecord(before, after) : {} }
  };
}

export function normalizeAutoModRuleDelete(rule: AutoModerationRule): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "automod.rule.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: rule.guild.id,
    actorId: rule.creatorId,
    channelId: null,
    messageId: null,
    payload: { rule: autoModRulePayload(rule) }
  };
}

export function normalizeAutoModAction(execution: AutoModerationActionExecution): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "automod.action",
    eventTimestamp: now,
    receivedAt: now,
    guildId: execution.guild.id,
    actorId: execution.userId,
    channelId: execution.channelId,
    messageId: execution.messageId,
    payload: { action: autoModActionPayload(execution) }
  };
}
