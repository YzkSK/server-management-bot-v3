import { parseDashboardAuthEnv } from "@sm-bot/config";
import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const env = parseDashboardAuthEnv();

// signInコールバックでのユーザー/ギルド制限は意図的に行っていない(issue #85)。
// RBAC設計(docs/specs/rewrite-architecture-design.md §6)により、認可は
// capabilitiesベースでtRPCルーター層(requireCapability)に委譲されるため、
// 関連する能力を一切持たないユーザーがログインしても操作可能な範囲はない。
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
