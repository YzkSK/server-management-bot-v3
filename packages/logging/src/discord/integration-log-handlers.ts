import type { NormalizedEvent } from "@sm-bot/shared";
import type { Guild } from "discord.js";

import { normalizeIntegrationUpdate } from "./integration-events.js";

export interface IntegrationLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface IntegrationLogHandlers {
  onIntegrationsUpdate: (guild: Guild) => Promise<void>;
}

export function createIntegrationLogHandlers(deps: IntegrationLogHandlerDeps): IntegrationLogHandlers {
  return {
    async onIntegrationsUpdate(guild) {
      await writeSafely(deps, normalizeIntegrationUpdate(guild));
    }
  };
}

async function writeSafely(deps: IntegrationLogHandlerDeps, event: NormalizedEvent): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("integration-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
