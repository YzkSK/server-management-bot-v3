import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string | undefined;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordAccessToken?: string | undefined;
    discordRefreshToken?: string | undefined;
    // Discordアクセストークンの失効時刻(UNIX秒)。account.expires_atをそのまま保持する。
    discordExpiresAt?: number | undefined;
  }
}
