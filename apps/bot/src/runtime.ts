import { parseBotEnv } from "@sm-bot/config";
import { createDiscordClient } from "@sm-bot/core";
import { createDbConnection, ensureEveryoneBaselineGrant } from "@sm-bot/db";
import { Events, GatewayIntentBits } from "discord.js";

import { handleGuildCreate } from "./guild-join.js";

export async function startBot(): Promise<void> {
  const env = parseBotEnv();
  const { db, close } = createDbConnection(env.DATABASE_URL);
  const client = createDiscordClient({
    token: env.DISCORD_BOT_TOKEN,
    intents: [GatewayIntentBits.Guilds]
  });

  client.on(Events.GuildCreate, (guild) => {
    void handleGuildCreate(
      { guildId: guild.id, everyoneRoleId: guild.roles.everyone.id },
      { db, ensureEveryoneBaselineGrant }
    ).catch((err: unknown) => {
      console.error("guild-join: failed to seed baseline grant", { guildId: guild.id, err });
    });
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`bot started as ${readyClient.user.tag}`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`bot: received ${signal}, shutting down`);
    void Promise.allSettled([client.destroy(), close()]).then(() => {
      process.exit(0);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await client.login(env.DISCORD_BOT_TOKEN);
}
