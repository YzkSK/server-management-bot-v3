import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type Role } from "discord.js";

import {
  normalizeRoleCreate,
  normalizeRoleDelete,
  normalizeRoleUpdate
} from "./role-events.js";
import { correlateWithAuditLog } from "./audit-log.js";
import { writeSafely } from "./write-safely.js";

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
      const event = normalizeRoleCreate(role);
      const correlated = await correlateWithAuditLog(
        event,
        role.guild,
        AuditLogEvent.RoleCreate,
        role.id
      );
      await writeSafely(deps, correlated, "role-log-handlers");
    },

    async onRoleDelete(role) {
      const event = normalizeRoleDelete(role);
      const correlated = await correlateWithAuditLog(
        event,
        role.guild,
        AuditLogEvent.RoleDelete,
        role.id
      );
      await writeSafely(deps, correlated, "role-log-handlers");
    },

    async onRoleUpdate(oldRole, newRole) {
      const event = normalizeRoleUpdate(oldRole, newRole);
      if (!event) {
        return;
      }
      const correlated = await correlateWithAuditLog(
        event,
        newRole.guild,
        AuditLogEvent.RoleUpdate,
        newRole.id
      );
      await writeSafely(deps, correlated, "role-log-handlers");
    }
  };
}
