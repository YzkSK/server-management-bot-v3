import type { NormalizedEvent } from "@sm-bot/shared";
import type { StageInstance } from "discord.js";

import { diffRecord } from "./payloads.js";

function stagePayload(stage: StageInstance) {
  return {
    id: stage.id,
    channelId: stage.channelId,
    topic: stage.topic,
    privacyLevel: stage.privacyLevel,
    discoverableDisabled: stage.discoverableDisabled
  };
}

export function normalizeStageCreate(stage: StageInstance): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "stage.create",
    eventTimestamp: now,
    receivedAt: now,
    guildId: stage.guildId,
    actorId: null,
    channelId: stage.channelId,
    messageId: null,
    payload: { stage: stagePayload(stage) }
  };
}

export function normalizeStageUpdate(
  oldStage: StageInstance | null,
  newStage: StageInstance
): NormalizedEvent {
  const before = oldStage ? stagePayload(oldStage) : null;
  const after = stagePayload(newStage);
  const now = new Date();
  return {
    eventName: "stage.update",
    eventTimestamp: now,
    receivedAt: now,
    guildId: newStage.guildId,
    actorId: null,
    channelId: newStage.channelId,
    messageId: null,
    payload: { before, after, changes: before ? diffRecord(before, after) : {} }
  };
}

export function normalizeStageDelete(stage: StageInstance): NormalizedEvent {
  const now = new Date();
  return {
    eventName: "stage.delete",
    eventTimestamp: now,
    receivedAt: now,
    guildId: stage.guildId,
    actorId: null,
    channelId: stage.channelId,
    messageId: null,
    payload: { stage: stagePayload(stage) }
  };
}
