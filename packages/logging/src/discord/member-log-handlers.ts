import type { NormalizedEvent } from "@sm-bot/shared";
import { AuditLogEvent, type GuildBan, type GuildMember, type PartialGuildMember } from "discord.js";

import {
  normalizeMemberBan,
  normalizeMemberJoin,
  normalizeMemberLeave,
  normalizeMemberUnban,
  normalizeMemberUpdate
} from "./member-events.js";
import { correlateWithAuditLog, lookupAuditLog, applyAuditLog } from "./audit-log.js";

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
  onGuildBanAdd: (ban: GuildBan) => Promise<void>;
  onGuildBanRemove: (ban: GuildBan) => Promise<void>;
}

/** onGuildBanAddとonGuildMemberRemoveがほぼ同時に発火した際、member.leaveの二重記録を防ぐための保持期間。 */
const RECENT_BAN_MARK_TTL_MS = 10_000;
/** GuildMemberRemoveがGuildBanAddより先に届いた場合に、遅れてくるban通知を待つ猶予時間。 */
const BAN_ARRIVAL_GRACE_MS = 500;

export function createMemberLogHandlers(deps: MemberLogHandlerDeps): MemberLogHandlers {
  // Audit Log権限やAPI取得失敗、GuildBanAdd/GuildMemberRemoveの到着順に左右されず、
  // ban起因の退出を確実に判定するための一時マーキング(双方向)。
  const recentBans = new Map<string, NodeJS.Timeout>();
  // GuildMemberRemoveが先に届き、ban通知の到着を待っている間の解除コールバック。
  const pendingRemovals = new Map<string, () => void>();
  const banKey = (guildId: string, userId: string): string => `${guildId}:${userId}`;

  const markRecentBan = (guildId: string, userId: string): void => {
    const key = banKey(guildId, userId);

    const cancelPendingRemoval = pendingRemovals.get(key);
    if (cancelPendingRemoval) {
      // GuildMemberRemoveが先に届き待機中だった場合は、そちらのmember.leave書き込みを止めるだけでよい。
      pendingRemovals.delete(key);
      cancelPendingRemoval();
      return;
    }

    clearTimeout(recentBans.get(key));
    const timer = setTimeout(() => recentBans.delete(key), RECENT_BAN_MARK_TTL_MS);
    timer.unref?.();
    recentBans.set(key, timer);
  };

  const consumeRecentBan = (guildId: string, userId: string): boolean => {
    const key = banKey(guildId, userId);
    const timer = recentBans.get(key);
    if (!timer) {
      return false;
    }
    clearTimeout(timer);
    recentBans.delete(key);
    return true;
  };

  /** ban通知がまだ届いていない場合、短時間だけ到着を待つ。trueならban起因と判明したことを示す。 */
  const waitForBanArrival = (guildId: string, userId: string): Promise<boolean> => {
    const key = banKey(guildId, userId);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRemovals.delete(key);
        resolve(false);
      }, BAN_ARRIVAL_GRACE_MS);
      timer.unref?.();
      pendingRemovals.set(key, () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  };

  return {
    async onGuildMemberAdd(member) {
      await writeSafely(deps, normalizeMemberJoin(member));
    },

    async onGuildMemberRemove(member) {
      if (consumeRecentBan(member.guild.id, member.id)) {
        // onGuildBanAddがmember.banとして記録済みのため、member.leaveは書かない。
        return;
      }

      if (await waitForBanArrival(member.guild.id, member.id)) {
        // 猶予時間内にonGuildBanAddが到着し、member.banとして記録された。
        return;
      }

      const event = normalizeMemberLeave(member);
      const kickLog = await lookupAuditLog(member.guild, AuditLogEvent.MemberKick, member.id, {
        referenceTime: event.eventTimestamp
      });
      if (kickLog.status === "matched") {
        // マッチした場合のみ、キック実行者付きのmember.kickとして記録する。
        await writeSafely(deps, applyAuditLog({ ...event, eventName: "member.kick" }, kickLog));
        return;
      }

      await writeSafely(deps, applyAuditLog(event, kickLog));
    },

    async onGuildMemberUpdate(oldMember, newMember) {
      const event = normalizeMemberUpdate(oldMember, newMember);
      if (!event) {
        return;
      }
      const changes = (event.payload as { changes?: Record<string, unknown> }).changes ?? {};
      // ロール付与/剥奪はMemberUpdateではなくMemberRoleUpdateとして記録される。
      const action =
        "roles" in changes ? AuditLogEvent.MemberRoleUpdate : AuditLogEvent.MemberUpdate;
      const correlated = await correlateWithAuditLog(event, newMember.guild, action, newMember.id);
      await writeSafely(deps, correlated);
    },

    async onGuildBanAdd(ban) {
      markRecentBan(ban.guild.id, ban.user.id);
      const event = normalizeMemberBan(ban);
      const correlated = await correlateWithAuditLog(
        event,
        ban.guild,
        AuditLogEvent.MemberBanAdd,
        ban.user.id
      );
      await writeSafely(deps, correlated);
    },

    async onGuildBanRemove(ban) {
      const event = normalizeMemberUnban(ban);
      const correlated = await correlateWithAuditLog(
        event,
        ban.guild,
        AuditLogEvent.MemberBanRemove,
        ban.user.id
      );
      await writeSafely(deps, correlated);
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
