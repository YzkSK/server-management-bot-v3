import { Client, type ClientOptions, type GatewayIntentBits } from "discord.js";

export interface CreateDiscordClientOptions {
  token: string;
  intents: readonly GatewayIntentBits[];
}

/**
 * discord.jsのClientをintentsで生成する薄いラッパー。
 * tokenはここではclient.login()に使わない。ログインは呼び出し側の責務。
 */
export function createDiscordClient(options: CreateDiscordClientOptions): Client {
  const clientOptions: ClientOptions = {
    intents: [...options.intents]
  };
  return new Client(clientOptions);
}
