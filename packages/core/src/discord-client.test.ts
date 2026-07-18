import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GatewayIntentBits, Partials } from "discord.js";

import { createDiscordClient } from "./discord-client.js";

describe("createDiscordClient", () => {
  it("configures the client with the given intents", () => {
    const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
    const client = createDiscordClient({ token: "dummy-token", intents });

    assert.equal(client.options.intents.has(GatewayIntentBits.Guilds), true);
    assert.equal(client.options.intents.has(GatewayIntentBits.GuildMessages), true);
    assert.equal(client.options.intents.has(GatewayIntentBits.GuildVoiceStates), false);
  });

  it("does not log in with the token", () => {
    const client = createDiscordClient({
      token: "dummy-token",
      intents: [GatewayIntentBits.Guilds]
    });

    assert.equal(client.token, null);
  });

  it("configures no partials by default", () => {
    const client = createDiscordClient({
      token: "dummy-token",
      intents: [GatewayIntentBits.Guilds]
    });

    assert.deepEqual(client.options.partials, []);
  });

  it("configures the given partials when provided", () => {
    const client = createDiscordClient({
      token: "dummy-token",
      intents: [GatewayIntentBits.Guilds],
      partials: [Partials.Message, Partials.Channel]
    });

    assert.deepEqual(client.options.partials, [Partials.Message, Partials.Channel]);
  });
});
