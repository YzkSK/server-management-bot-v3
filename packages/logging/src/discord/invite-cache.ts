import type { Guild, Invite } from "discord.js";

export interface CachedInvite {
  code: string;
  url: string;
  maxAge: number | null;
  maxUses: number | null;
  temporary: boolean | null;
  uses: number | null;
  inviterId: string | null;
}

export interface InviteCache {
  initGuild: (guild: Guild) => Promise<void>;
  set: (guildId: string, invite: Invite) => void;
  getAndDelete: (guildId: string, code: string) => CachedInvite | null;
}

type GuildInviteMap = Map<string, CachedInvite>;

function toCached(invite: Invite): CachedInvite {
  return {
    code: invite.code,
    url: invite.url,
    maxAge: invite.maxAge,
    maxUses: invite.maxUses,
    temporary: invite.temporary,
    uses: invite.uses,
    inviterId: invite.inviter?.id ?? null
  };
}

export function createInviteCache(): InviteCache {
  const cache = new Map<string, GuildInviteMap>();

  function getOrCreate(guildId: string): GuildInviteMap {
    let map = cache.get(guildId);
    if (!map) {
      map = new Map();
      cache.set(guildId, map);
    }
    return map;
  }

  return {
    async initGuild(guild) {
      try {
        const invites = await guild.invites.fetch();
        const map = getOrCreate(guild.id);
        // fetch中にonInviteCreate経由でset()されたエントリを消さないよう、
        // clear()せずマージする(取得結果で上書き・追加のみ行う)。
        for (const invite of invites.values()) {
          map.set(invite.code, toCached(invite));
        }
      } catch (err) {
        // MANAGE_GUILD権限が無い場合はスキップする(旧実装踏襲)が、
        // ネットワーク断等の想定外の失敗は観測できるよう記録する。
        console.error("invite-cache: failed to initialize guild invites", {
          guildId: guild.id,
          err
        });
      }
    },

    set(guildId, invite) {
      getOrCreate(guildId).set(invite.code, toCached(invite));
    },

    getAndDelete(guildId, code) {
      const map = cache.get(guildId);
      if (!map) {
        return null;
      }
      const cached = map.get(code) ?? null;
      map.delete(code);
      return cached;
    }
  };
}
