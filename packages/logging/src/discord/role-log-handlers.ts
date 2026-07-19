import type { NormalizedEvent } from "@sm-bot/shared";
import type { Role } from "discord.js";

import {
  normalizeRoleCreate,
  normalizeRoleDelete,
  normalizeRoleUpdate
} from "./role-events.js";

export interface RoleLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface RoleLogHandlers {
  onRoleCreate: (role: Role) => Promise<void>;
  onRoleDelete: (role: Role) => Promise<void>;
  onRoleUpdate: (oldRole: Role, newRole: Role) => Promise<void>;
}

export function createRoleLogHandlers(deps: RoleLogHandlerDeps): RoleLogHandlers {
  return {
    async onRoleCreate(role) {
      await writeSafely(deps, normalizeRoleCreate(role));
    },

    async onRoleDelete(role) {
      await writeSafely(deps, normalizeRoleDelete(role));
    },

    async onRoleUpdate(oldRole, newRole) {
      const event = normalizeRoleUpdate(oldRole, newRole);
      if (!event) {
        return;
      }
      await writeSafely(deps, event);
    }
  };
}

async function writeSafely(deps: RoleLogHandlerDeps, event: NormalizedEvent): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("role-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
