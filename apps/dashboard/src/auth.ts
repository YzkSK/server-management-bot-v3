import { parseDashboardAuthEnv } from "@sm-bot/config";
import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const env = parseDashboardAuthEnv();

// signInコールバックでのユーザー/ギルド制限は意図的に行っていない(issue #85)。
// RBAC設計(docs/rewrite-architecture-design.md §6)により、業務操作の認可は
// tRPCルーター層のrequireCapabilityによるcapabilitiesベースの判定に委譲する。
// capability不要で許可するのは、ログイン状態や自己権限を返すme等の自己参照APIに限定する。
export const authOptions: AuthOptions = {
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
      // accountはサインイン直後のみ渡される。以降のリクエストではtokenに
      // 既に積まれた値をそのまま引き継ぐ(リフレッシュは今回のスコープ外)。
      if (account?.access_token) {
        token.discordAccessToken = account.access_token;
      }
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
