import { parseDashboardAuthEnv } from "@sm-bot/config";
import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const env = parseDashboardAuthEnv();

// signInコールバックでのユーザー/ギルド制限は意図的に行っていない(issue #85)。
// RBAC設計(docs/specs/rewrite-architecture-design.md §6)により、業務操作の認可は
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
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
      }
      return session;
    }
  }
};
