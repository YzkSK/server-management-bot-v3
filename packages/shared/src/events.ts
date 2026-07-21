import { z } from "zod";

export const realtimeDefaultEnabledEvents = [
  "guild.update",
  "message.update",
  "message.delete",
  "message.bulk_delete",
  "member.join",
  "member.leave",
  "member.update",
  "member.kick",
  "member.ban",
  "member.unban",
  "member.timeout",
  "role.create",
  "role.update",
  "role.delete",
  "channel.create",
  "channel.update",
  "channel.delete",
  "channel.permission_update",
  "thread.create",
  "thread.update",
  "thread.delete",
  "invite.create",
  "invite.delete",
  "emoji.create",
  "emoji.update",
  "emoji.delete",
  "sticker.create",
  "sticker.update",
  "sticker.delete",
  "webhook.create",
  "webhook.update",
  "webhook.delete",
  "voice.temp.created",
  "voice.temp.deleted",
  "voice.temp.owner_transferred",
  "voice.temp.user_kicked",
  "voice.session.join",
  "voice.session.leave",
  "voice.session.move",
  "call.started",
  "call.ended",
  "recruitment.created",
  "recruitment.full",
  "recruitment.closed",
  "recruitment.reopened",
  "recruitment.expired",
  "tts.session.started",
  "tts.session.stopped",
  "system.bot.crashed",
  "system.handler.error",
  "system.database.error",
  "system.redis.error",
  "system.voicevox.error",
  "system.backup.failed",
  "system.rate_limit"
] as const;

export const realtimeDefaultDisabledEvents = [
  "message.create",
  "message.reaction.add",
  "message.reaction.remove",
  "tts.message.skipped",
  "tts.message.spoken",
  "voice.state.update",
  "call.updated",
  "system.bot.started",
  "system.backup.completed",
  "dashboard.login",
  "dashboard.logout",
  "config.updated"
] as const;

export const eventNameSchema = z.string().min(1).max(128);

export type RealtimeDefaultEnabledEvent =
  (typeof realtimeDefaultEnabledEvents)[number];

export type RealtimeDefaultDisabledEvent =
  (typeof realtimeDefaultDisabledEvents)[number];
