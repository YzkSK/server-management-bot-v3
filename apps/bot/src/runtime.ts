import { parseBotEnv } from "@sm-bot/config";
import { createDiscordClient } from "@sm-bot/core";
import { createDbConnection, ensureEveryoneBaselineGrant, insertLogEvent } from "@sm-bot/db";
import {
  createMessageLogHandlers,
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
      GatewayIntentBits.MessageContent
    ],
    // キャッシュされていないメッセージのupdate/deleteイベントを受け取るためにpartialを有効化する。
    // 有効化しないと、discord.jsはそれらのイベントを部分データとしてすら発火しない。
    partials: [Partials.Message, Partials.Channel]
  });

  client.on(Events.GuildCreate, (guild) => {
    void handleGuildCreate(
      { guildId: guild.id, everyoneRoleId: guild.roles.everyone.id },
      { db, ensureEveryoneBaselineGrant }
    ).catch((err: unknown) => {
      console.error("guild-join: failed to seed baseline grant", { guildId: guild.id, err });
    });
  });

  const messageLogHandlers = createMessageLogHandlers({
    writeLogEvent: (event) =>
      writeLogEvent({ db, redis: redisStreamWriter, insertLogEvent }, event)
  });

  // shutdown時にDB/Redis接続を閉じる前に、処理中のログ書き込みを待機するための追跡集合。
  const pendingLogWrites = new Set<Promise<void>>();
  const trackLogWrite = (promise: Promise<void>): void => {
    pendingLogWrites.add(promise);
    void promise.then(
      () => pendingLogWrites.delete(promise),
      (err: unknown) => {
        pendingLogWrites.delete(promise);
        console.error("bot: message log handler failed unexpectedly", err);
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

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`bot started as ${readyClient.user.tag}`);
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
