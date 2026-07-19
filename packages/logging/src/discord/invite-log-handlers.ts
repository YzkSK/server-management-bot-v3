import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type Guild, type Invite } from "discord.js";

import { correlateWithAuditLog, getInviteGuild } from "./audit-log.js";
import type { InviteCache } from "./invite-cache.js";
import { normalizeInviteCreate, normalizeInviteDelete } from "./invite-events.js";

export interface InviteLogHandlerDeps {
  writeLogEvent: (event: NormalizedEvent) => Promise<void>;
  inviteCache: InviteCache;
}

export interface InviteLogHandlers {
  onClientReady: (guilds: Iterable<Guild>) => void;
  onGuildCreate: (guild: Guild) => void;
  onInviteCreate: (invite: Invite) => Promise<void>;
  onInviteDelete: (invite: Invite) => Promise<void>;
}

export function createInviteLogHandlers(deps: InviteLogHandlerDeps): InviteLogHandlers {
  return {
    // initGuildの完了を待たずに次のイベント処理へ進む(fire-and-forget)。
    // 起動直後の短いウィンドウでinvite.deleteが届いた場合、キャッシュ未初期化により
    // maxAge等の補完データが欠けることがあるが、書き込み自体は失敗しない
    // (許容している劣化。完全に防ぐには全guildのinitGuild完了を待つ必要があり、
    // 起動時間とのトレードオフになるため見送る)。
    onClientReady(guilds) {
      for (const guild of guilds) {
        void deps.inviteCache.initGuild(guild);
      }
    },

    onGuildCreate(guild) {
      void deps.inviteCache.initGuild(guild);
    },

    async onInviteCreate(invite) {
      const guildId = invite.guild?.id ?? null;
      if (guildId) {
        deps.inviteCache.set(guildId, invite);
      }
      const event = normalizeInviteCreate(invite);
      const correlated = await correlateWithAuditLog(
        event,
        getInviteGuild(invite),
        AuditLogEvent.InviteCreate,
        invite.code
      );
      await writeSafely(deps, correlated);
    },

    async onInviteDelete(invite) {
      const guildId = invite.guild?.id ?? null;
      const cached = guildId ? deps.inviteCache.getAndDelete(guildId, invite.code) : null;
      const event = normalizeInviteDelete(invite, cached);
      const correlated = await correlateWithAuditLog(
        event,
        getInviteGuild(invite),
        AuditLogEvent.InviteDelete,
        invite.code
      );
      await writeSafely(deps, correlated);
    }
  };
}

async function writeSafely(deps: InviteLogHandlerDeps, event: NormalizedEvent): Promise<void> {
  try {
    await deps.writeLogEvent(event);
  } catch (err) {
    console.error("invite-log-handlers: failed to write log event", {
      eventName: event.eventName,
      guildId: event.guildId,
      err
    });
  }
}
