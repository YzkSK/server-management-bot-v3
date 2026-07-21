import type { NormalizedEvent } from "@sm-bot/shared";
import type { Guild } from "discord.js";

import { normalizeIntegrationUpdate } from "./integration-events.js";
import { writeSafely } from "./write-safely.js";

export interface IntegrationLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface IntegrationLogHandlers {
  onIntegrationsUpdate: (guild: Guild) => Promise<void>;
}

export function createIntegrationLogHandlers(deps: IntegrationLogHandlerDeps): IntegrationLogHandlers {
  return {
    async onIntegrationsUpdate(guild) {
      await writeSafely(deps, normalizeIntegrationUpdate(guild), "integration-log-handlers");
    }
  };
}
