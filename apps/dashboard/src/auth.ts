import { parseDashboardAuthEnv } from "@sm-bot/config";
import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const env = parseDashboardAuthEnv();

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
