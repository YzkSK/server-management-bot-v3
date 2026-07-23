import { parseDashboardAuthEnv } from "@sm-bot/config";
import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

import {
  refreshDiscordAccessToken as refreshDiscordAccessTokenDefault,
  shouldRefreshDiscordToken,
  type DiscordTokenRefreshCacheClient,
  type DiscordTokenRefreshResult
} from "./server/discord-token-refresh";
import { getDashboardRedisClient as getDashboardRedisClientDefault } from "./server/trpc-context";

const env = parseDashboardAuthEnv();

export interface CreateAuthOptionsDeps {
  getRedisClient?: () => Promise<DiscordTokenRefreshCacheClient>;
  refreshDiscordAccessToken?: (input: {
    cache: DiscordTokenRefreshCacheClient;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }) => Promise<DiscordTokenRefreshResult>;
  now?: () => number;
}

// signInコールバックでのユーザー/ギルド制限は意図的に行っていない(issue #85)。
// RBAC設計(docs/rewrite-architecture-design.md §6)により、業務操作の認可は
// tRPCルーター層のrequireCapabilityによるcapabilitiesベースの判定に委譲する。
// capability不要で許可するのは、ログイン状態や自己権限を返すme等の自己参照APIに限定する。
export function createAuthOptions(deps: CreateAuthOptionsDeps = {}): AuthOptions {
  const getRedisClient = deps.getRedisClient ?? getDashboardRedisClientDefault;
  const refreshDiscordAccessToken = deps.refreshDiscordAccessToken ?? refreshDiscordAccessTokenDefault;
  const now = deps.now ?? (() => Date.now());

  return {
    secret: env.NEXTAUTH_SECRET,
    providers: [
      DiscordProvider({
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        authorization: { params: { scope: "identify guilds" } }
      })
    ],
    callbacks: {
      async jwt({ token, account }) {
        // accountはサインイン直後のみ渡される。access_token/refresh_token/expires_at
        // (UNIX秒)をtokenに保存する。
        if (account?.access_token) {
          token.discordAccessToken = account.access_token;
          token.discordRefreshToken = account.refresh_token;
          token.discordExpiresAt = account.expires_at;
          return token;
        }

        // リフレッシュ可能な情報がない(初回サインイン以前の古いセッション等)場合は
        // そのまま引き継ぐ。呼び出し側は401→再ログイン導線で対処する。
        if (!token.discordRefreshToken || !token.discordExpiresAt) {
          return token;
        }

        // まだ有効な間(失効直前のバッファを含む)はリフレッシュせずそのまま引き継ぐ。
        if (!shouldRefreshDiscordToken(token.discordExpiresAt, now)) {
          return token;
        }

        let result: DiscordTokenRefreshResult;
        try {
          const cache = await getRedisClient();
          result = await refreshDiscordAccessToken({
            cache,
            refreshToken: token.discordRefreshToken,
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET
          });
        } catch {
          // Redis接続自体に失敗した場合も、既存トークンを破棄せず次回再試行させる。
          return token;
        }

        if (result.kind === "invalid_grant") {
          // Discordがrefresh_tokenを拒否した場合のみDiscordトークンの状態をクリアし、
          // 既存の401→再ログイン導線に委ねる。
          token.discordAccessToken = undefined;
          token.discordRefreshToken = undefined;
          token.discordExpiresAt = undefined;
          return token;
        }

        if (result.kind === "transient_failure") {
          // ネットワーク断・timeout・ロック待機超過等。既存トークンを破棄せず
          // 次回のリクエストで再試行させる。
          return token;
        }

        token.discordAccessToken = result.token.accessToken;
        token.discordRefreshToken = result.token.refreshToken;
        token.discordExpiresAt = result.token.expiresAt;
        return token;
      },
      async session({ session, token }) {
        // discordAccessTokenは/api/auth/session経由でクライアントに露出してしまうため、
        // sessionには含めない。サーバー側でDiscordトークンが必要な場合はnext-auth/jwtの
        // getTokenでJWTを直接読む(trpc-context.tsのcreateContext参照)。
        if (session.user) {
          session.user.id = token.sub;
        }
        return session;
      }
    }
  };
}

export const authOptions: AuthOptions = createAuthOptions();
