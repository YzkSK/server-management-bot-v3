import type { NormalizedEvent } from "@sm-bot/shared";
import type { GuildMember, PartialGuildMember } from "discord.js";

import {
  normalizeMemberJoin,
  normalizeMemberLeave,
  normalizeMemberUpdate
} from "./member-events.js";

export interface MemberLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
}

export interface MemberLogHandlers {
  onGuildMemberAdd: (member: GuildMember) => Promise<void>;
  onGuildMemberRemove: (member: GuildMember | PartialGuildMember) => Promise<void>;
  onGuildMemberUpdate: (
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember
  ) => Promise<void>;
}

export function createMemberLogHandlers(deps: MemberLogHandlerDeps): MemberLogHandlers {
  return {
    async onGuildMemberAdd(member) {
      await writeSafely(deps, normalizeMemberJoin(member));
    },

    async onGuildMemberRemove(member) {
      await writeSafely(deps, normalizeMemberLeave(member));
    },

    async onGuildMemberUpdate(oldMember, newMember) {
      const event = normalizeMemberUpdate(oldMember, newMember);
      if (!event) {
        return;
      }
      await writeSafely(deps, event);
    }
  };
}

async function writeSafely(
  deps: MemberLogHandlerDeps,
  event: NormalizedEvent
): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("member-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
