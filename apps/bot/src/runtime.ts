import { parseBotEnv } from "@sm-bot/config";
import { createDiscordClient } from "@sm-bot/core";
import {
  createDbConnection,
  ensureEveryoneBaselineGrant,
  getGuildLogMode,
  getUnsyncedLogEvents,
  insertLogEvent,
  markLogEventStreamSynced,
  upsertGuild
} from "@sm-bot/db";
import {
  createAuditLogEntryLogHandlers,
  createAutoModLogHandlers,
  createChannelLogHandlers,
  createEmojiStickerLogHandlers,
  createGuildLogHandlers,
  createIntegrationLogHandlers,
  createInviteCache,
  createInviteLogHandlers,
  createMemberLogHandlers,
  createMessageLogHandlers,
  createPollLogHandlers,
  createRoleLogHandlers,
  createScheduledEventLogHandlers,
  createStageLogHandlers,
  createThreadLogHandlers,
  startLogStreamBackfillLoop,
  writeLogEvent,
  type RedisStreamWriter
} from "@sm-bot/logging";
import { Events, GatewayIntentBits, Partials } from "discord.js";
import { createClient } from "redis";

import { handleGuildCreate } from "./guild-join.js";

export async function startBot(): Promise<void> {
  const env = parseBotEnv();
  const { db, close } = createDbConnection(env.DATABASE_URL);

  const redisClient = createClient({ url: env.REDIS_URL });
  redisClient.on("error", (err: unknown) => {
    console.error("bot: redis client error", err);
  });
  try {
    await redisClient.connect();
  } catch (err) {
    await close();
    throw err;
  }

  const redisStreamWriter: RedisStreamWriter = {
    xAdd: (key, id, fields) => redisClient.xAdd(key, id, fields)
  };

  const client = createDiscordClient({
    token: env.DISCORD_BOT_TOKEN,
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      // privileged intent: Discord Developer PortalでMessage Content Intentを
      // 有効化しないと、message.contentが常に空文字になる。
      GatewayIntentBits.MessageContent,
      // privileged intent: Discord Developer PortalでServer Members Intentを
      // 有効化しないと、guildMemberAdd/Remove/Updateが発火しない。
      GatewayIntentBits.GuildMembers,
      // guildBanAdd/guildBanRemove、guildAuditLogEntryCreateの受信に必要。
      GatewayIntentBits.GuildModeration,
      // invite.create/deleteの受信に必要。
      GatewayIntentBits.GuildInvites,
      // emoji.*/sticker.*の受信に必要。
      GatewayIntentBits.GuildEmojisAndStickers,
      // webhook.updateの受信に必要。
      GatewayIntentBits.GuildWebhooks,
      // automod.rule.*の受信に必要。
      GatewayIntentBits.AutoModerationConfiguration,
      // automod.actionの受信に必要。
      GatewayIntentBits.AutoModerationExecution,
      // integration.updateの受信に必要。
      GatewayIntentBits.GuildIntegrations,
      // message.poll.vote/unvoteの受信に必要。
      GatewayIntentBits.GuildMessagePolls,
      // event.*の受信に必要。
      GatewayIntentBits.GuildScheduledEvents
    ],
    // キャッシュされていないメッセージのupdate/deleteイベントを受け取るためにpartialを有効化する。
    // 有効化しないと、discord.jsはそれらのイベントを部分データとしてすら発火しない。
    partials: [Partials.Message, Partials.Channel]
  });

  const boundWriteLogEvent = (event: Parameters<typeof writeLogEvent>[1]) =>
    writeLogEvent(
      {
        db,
        redis: redisStreamWriter,
        insertLogEvent,
        getGuildLogMode,
        upsertGuild,
        markLogEventStreamSynced
      },
      event
    );

  const stopLogStreamBackfillLoop = startLogStreamBackfillLoop({
    db,
    redis: redisStreamWriter,
    getUnsyncedLogEvents,
    markLogEventStreamSynced
  });

  const messageLogHandlers = createMessageLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const memberLogHandlers = createMemberLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const roleLogHandlers = createRoleLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const channelLogHandlers = createChannelLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const guildLogHandlers = createGuildLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const threadLogHandlers = createThreadLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const inviteCache = createInviteCache();
  const inviteLogHandlers = createInviteLogHandlers({
    writeLogEvent: boundWriteLogEvent,
    inviteCache
  });
  const emojiStickerLogHandlers = createEmojiStickerLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const autoModLogHandlers = createAutoModLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const integrationLogHandlers = createIntegrationLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const pollLogHandlers = createPollLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const scheduledEventLogHandlers = createScheduledEventLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const stageLogHandlers = createStageLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });
  const auditLogEntryLogHandlers = createAuditLogEntryLogHandlers({
    writeLogEvent: boundWriteLogEvent
  });

  client.on(Events.GuildCreate, (guild) => {
    void handleGuildCreate(
      { guildId: guild.id, everyoneRoleId: guild.roles.everyone.id },
      { db, ensureEveryoneBaselineGrant }
    ).catch((err: unknown) => {
      console.error("guild-join: failed to seed baseline grant", { guildId: guild.id, err });
    });
    inviteLogHandlers.onGuildCreate(guild);
  });

  // shutdown時にDB/Redis接続を閉じる前に、処理中のログ書き込みを待機するための追跡集合。
  const pendingLogWrites = new Set<Promise<void>>();
  const trackLogWrite = (promise: Promise<void>): void => {
    pendingLogWrites.add(promise);
    void promise.then(
      () => pendingLogWrites.delete(promise),
      (err: unknown) => {
        pendingLogWrites.delete(promise);
        console.error("bot: log handler failed unexpectedly", err);
      }
    );
  };

  client.on(Events.MessageCreate, (message) => {
    trackLogWrite(messageLogHandlers.onMessageCreate(message));
  });
  client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    trackLogWrite(messageLogHandlers.onMessageUpdate(oldMessage, newMessage));
  });
  client.on(Events.MessageDelete, (message) => {
    trackLogWrite(messageLogHandlers.onMessageDelete(message));
  });

  client.on(Events.GuildMemberAdd, (member) => {
    trackLogWrite(memberLogHandlers.onGuildMemberAdd(member));
  });
  client.on(Events.GuildMemberRemove, (member) => {
    trackLogWrite(memberLogHandlers.onGuildMemberRemove(member));
  });
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    trackLogWrite(memberLogHandlers.onGuildMemberUpdate(oldMember, newMember));
  });
  client.on(Events.GuildBanAdd, (ban) => {
    trackLogWrite(memberLogHandlers.onGuildBanAdd(ban));
  });
  client.on(Events.GuildBanRemove, (ban) => {
    trackLogWrite(memberLogHandlers.onGuildBanRemove(ban));
  });

  client.on(Events.GuildRoleCreate, (role) => {
    trackLogWrite(roleLogHandlers.onRoleCreate(role));
  });
  client.on(Events.GuildRoleDelete, (role) => {
    trackLogWrite(roleLogHandlers.onRoleDelete(role));
  });
  client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
    trackLogWrite(roleLogHandlers.onRoleUpdate(oldRole, newRole));
  });

  client.on(Events.ChannelCreate, (channel) => {
    trackLogWrite(channelLogHandlers.onChannelCreate(channel));
  });
  client.on(Events.ChannelDelete, (channel) => {
    trackLogWrite(channelLogHandlers.onChannelDelete(channel));
  });
  client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
    trackLogWrite(channelLogHandlers.onChannelUpdate(oldChannel, newChannel));
  });

  client.on(Events.GuildUpdate, (oldGuild, newGuild) => {
    trackLogWrite(guildLogHandlers.onGuildUpdate(oldGuild, newGuild));
  });

  client.on(Events.ThreadCreate, (thread, newlyCreated) => {
    trackLogWrite(threadLogHandlers.onThreadCreate(thread, newlyCreated));
  });
  client.on(Events.ThreadUpdate, (oldThread, newThread) => {
    trackLogWrite(threadLogHandlers.onThreadUpdate(oldThread, newThread));
  });
  client.on(Events.ThreadDelete, (thread) => {
    trackLogWrite(threadLogHandlers.onThreadDelete(thread));
  });

  client.on(Events.InviteCreate, (invite) => {
    trackLogWrite(inviteLogHandlers.onInviteCreate(invite));
  });
  client.on(Events.InviteDelete, (invite) => {
    trackLogWrite(inviteLogHandlers.onInviteDelete(invite));
  });

  client.on(Events.GuildEmojiCreate, (emoji) => {
    trackLogWrite(emojiStickerLogHandlers.onEmojiCreate(emoji));
  });
  client.on(Events.GuildEmojiDelete, (emoji) => {
    trackLogWrite(emojiStickerLogHandlers.onEmojiDelete(emoji));
  });
  client.on(Events.GuildEmojiUpdate, (oldEmoji, newEmoji) => {
    trackLogWrite(emojiStickerLogHandlers.onEmojiUpdate(oldEmoji, newEmoji));
  });
  client.on(Events.GuildStickerCreate, (sticker) => {
    trackLogWrite(emojiStickerLogHandlers.onStickerCreate(sticker));
  });
  client.on(Events.GuildStickerDelete, (sticker) => {
    trackLogWrite(emojiStickerLogHandlers.onStickerDelete(sticker));
  });
  client.on(Events.GuildStickerUpdate, (oldSticker, newSticker) => {
    trackLogWrite(emojiStickerLogHandlers.onStickerUpdate(oldSticker, newSticker));
  });

  client.on(Events.WebhooksUpdate, (channel) => {
    trackLogWrite(channelLogHandlers.onWebhooksUpdate(channel));
  });

  client.on(Events.AutoModerationRuleCreate, (rule) => {
    trackLogWrite(autoModLogHandlers.onRuleCreate(rule));
  });
  client.on(Events.AutoModerationRuleUpdate, (oldRule, newRule) => {
    trackLogWrite(autoModLogHandlers.onRuleUpdate(oldRule, newRule));
  });
  client.on(Events.AutoModerationRuleDelete, (rule) => {
    trackLogWrite(autoModLogHandlers.onRuleDelete(rule));
  });
  client.on(Events.AutoModerationActionExecution, (execution) => {
    trackLogWrite(autoModLogHandlers.onActionExecution(execution));
  });

  client.on(Events.GuildIntegrationsUpdate, (guild) => {
    trackLogWrite(integrationLogHandlers.onIntegrationsUpdate(guild));
  });

  client.on(Events.MessagePollVoteAdd, (answer, userId) => {
    trackLogWrite(pollLogHandlers.onPollVoteAdd(answer, userId));
  });
  client.on(Events.MessagePollVoteRemove, (answer, userId) => {
    trackLogWrite(pollLogHandlers.onPollVoteRemove(answer, userId));
  });

  client.on(Events.GuildScheduledEventCreate, (event) => {
    trackLogWrite(scheduledEventLogHandlers.onScheduledEventCreate(event));
  });
  client.on(Events.GuildScheduledEventUpdate, (oldEvent, newEvent) => {
    trackLogWrite(scheduledEventLogHandlers.onScheduledEventUpdate(oldEvent, newEvent));
  });
  client.on(Events.GuildScheduledEventDelete, (event) => {
    trackLogWrite(scheduledEventLogHandlers.onScheduledEventDelete(event));
  });
  client.on(Events.GuildScheduledEventUserAdd, (event, user) => {
    trackLogWrite(scheduledEventLogHandlers.onScheduledEventUserAdd(event, user));
  });
  client.on(Events.GuildScheduledEventUserRemove, (event, user) => {
    trackLogWrite(scheduledEventLogHandlers.onScheduledEventUserRemove(event, user));
  });

  client.on(Events.StageInstanceCreate, (stage) => {
    trackLogWrite(stageLogHandlers.onStageCreate(stage));
  });
  client.on(Events.StageInstanceUpdate, (oldStage, newStage) => {
    trackLogWrite(stageLogHandlers.onStageUpdate(oldStage, newStage));
  });
  client.on(Events.StageInstanceDelete, (stage) => {
    trackLogWrite(stageLogHandlers.onStageDelete(stage));
  });

  client.on(Events.GuildAuditLogEntryCreate, (auditLogEntry, guild) => {
    trackLogWrite(auditLogEntryLogHandlers.onAuditLogEntryCreate(auditLogEntry, guild));
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`bot started as ${readyClient.user.tag}`);
    inviteLogHandlers.onClientReady(readyClient.guilds.cache.values());
  });

  let isShuttingDown = false;
  const closeConnections = async (): Promise<void> => {
    await client.destroy();
    stopLogStreamBackfillLoop();
    await Promise.allSettled(pendingLogWrites);
    await Promise.allSettled([close(), redisClient.quit()]);
  };

  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`bot: received ${signal}, shutting down`);
    void closeConnections().finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  try {
    await client.login(env.DISCORD_BOT_TOKEN);
  } catch (err) {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
    isShuttingDown = true;
    await closeConnections();
    throw err;
  }
}
