import { parseBotEnv } from "@sm-bot/config";
import { createDiscordClient } from "@sm-bot/core";
import { createDbConnection, ensureEveryoneBaselineGrant, insertLogEvent } from "@sm-bot/db";
import {
  createChannelLogHandlers,
  createEmojiStickerLogHandlers,
  createGuildLogHandlers,
  createInviteCache,
  createInviteLogHandlers,
  createMemberLogHandlers,
  createMessageLogHandlers,
  createRoleLogHandlers,
  createThreadLogHandlers,
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
      // guildBanAdd/guildBanRemoveの受信に必要。
      GatewayIntentBits.GuildModeration,
      // invite.create/deleteの受信に必要。
      GatewayIntentBits.GuildInvites,
      // emoji.*/sticker.*の受信に必要。
      GatewayIntentBits.GuildEmojisAndStickers,
      // webhook.updateの受信に必要。
      GatewayIntentBits.GuildWebhooks
    ],
    // キャッシュされていないメッセージのupdate/deleteイベントを受け取るためにpartialを有効化する。
    // 有効化しないと、discord.jsはそれらのイベントを部分データとしてすら発火しない。
    partials: [Partials.Message, Partials.Channel]
  });

  const messageLogHandlers = createMessageLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event)
  });
  const memberLogHandlers = createMemberLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event)
  });
  const roleLogHandlers = createRoleLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event)
  });
  const channelLogHandlers = createChannelLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event)
  });
  const guildLogHandlers = createGuildLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event)
  });
  const threadLogHandlers = createThreadLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event)
  });
  const inviteCache = createInviteCache();
  const inviteLogHandlers = createInviteLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event),
    inviteCache
  });
  const emojiStickerLogHandlers = createEmojiStickerLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event)
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

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`bot started as ${readyClient.user.tag}`);
    inviteLogHandlers.onClientReady(readyClient.guilds.cache.values());
  });

  let isShuttingDown = false;
  const closeConnections = async (): Promise<void> => {
    await client.destroy();
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
