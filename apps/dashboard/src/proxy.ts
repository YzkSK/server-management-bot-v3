import { parseDashboardAuthEnv } from "@sm-bot/config";
import { encode, getToken, type JWT } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import {
  refreshDiscordAccessToken as refreshDiscordAccessTokenDefault,
  shouldRefreshDiscordToken,
  type DiscordTokenRefreshCacheClient,
  type DiscordTokenRefreshResult
} from "./server/discord-token-refresh";
import { getDashboardRedisClient as getDashboardRedisClientDefault } from "./server/trpc-context";

// Proxy(旧middleware)はNext.js 16よりNode.js runtimeがデフォルトであり、
// `runtime`設定オプションはProxyでは使用不可(設定するとエラーになる)。
// Redis接続やnode:crypto(discord-token-refresh.ts)はNode.js runtimeで問題なく動く。
// /api/auth/*はNextAuth自身のRoute Handlerに任せ、対象から除外する。
export const config = {
  matcher: ["/g/:path*", "/api/trpc/:path*"]
};

const env = parseDashboardAuthEnv();

// next-auth/jwtのgetToken()のデフォルト判定(next-auth/jwt/index.jsのgetToken実装)と
// 同じ基準でsecureCookieを決める。ここがgetTokenの判定とズレると、Proxyが書き換える
// CookieとNextAuthが実際に読むCookieの名前・Secure属性が一致せず、リフレッシュした
// トークンが永続化されない。
const secureCookie = env.NEXTAUTH_URL?.startsWith("https://") ?? Boolean(process.env.VERCEL);
const SESSION_COOKIE_NAME = secureCookie ? "__Secure-next-auth.session-token" : "next-auth.session-token";

// next-authが発行するJWEがこのサイズを超えるとNextAuthは複数Cookie
// (`${name}.0`, `${name}.1`, ...)に分割する(next-auth v4の内部仕様)。
// Proxyは単一Cookieの書き換えしかサポートしないため、分割が必要なほど巨大な
// トークンになった場合は書き換えを諦め、既存Cookieを壊さないようにする。
const MAX_SINGLE_COOKIE_BYTES = 3933;

export interface CreateProxyDeps {
  getRedisClient?: () => Promise<DiscordTokenRefreshCacheClient>;
  refreshDiscordAccessToken?: (input: {
    cache: DiscordTokenRefreshCacheClient;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }) => Promise<DiscordTokenRefreshResult>;
  now?: () => number;
}

function remainingMaxAgeSeconds(token: JWT, nowMs: number): number | null {
  // 通常のnext-auth発行JWTには必ずexpクレームが含まれる(jwt/index.jsのencode参照)。
  // 欠落は異常系であり、セッション有効期限を安全に維持できないため書き換えを行わない。
  if (typeof token.exp !== "number") return null;
  const remaining = Math.floor(token.exp - nowMs / 1000);
  return remaining > 0 ? remaining : null;
}

// layout.tsx(Server Component)からのgetServerSession()やtrpc-context.tsからの
// getToken()はレスポンスCookieを書き換えられないため、Discordトークンのリフレッシュ
// (jwt callbackがtokenを変更するケース)を行ってもブラウザ側のCookieには反映されない。
// そのため、Cookie書き換えが可能なProxyで先回りしてリフレッシュを行い、
// リクエスト・レスポンス双方のCookieを更新する。auth.ts側のjwt callbackの同等ロジックは
// NextAuthの/api/auth/session等ルートハンドラ経由で正しく効く経路のため、二重の安全網
// として維持している。
export function createProxy(deps: CreateProxyDeps = {}) {
  const getRedisClient = deps.getRedisClient ?? getDashboardRedisClientDefault;
  const refreshDiscordAccessToken = deps.refreshDiscordAccessToken ?? refreshDiscordAccessTokenDefault;
  const now = deps.now ?? (() => Date.now());

  return async function proxy(req: NextRequest): Promise<NextResponse> {
    const token = await getToken({
      req,
      secret: env.NEXTAUTH_SECRET,
      secureCookie,
      cookieName: SESSION_COOKIE_NAME
    });

    if (!token?.discordRefreshToken || !token.discordExpiresAt) {
      return NextResponse.next();
    }

    if (!shouldRefreshDiscordToken(token.discordExpiresAt, now)) {
      return NextResponse.next();
    }

    // Discordへのリフレッシュを実行する前に、その結果を安全にCookieへ永続化できるか
    // 判定しておく。永続化できないのにリフレッシュを実行すると、Discord側で
    // refresh_tokenがローテーションされた結果だけが失われてしまう。
    const maxAge = remainingMaxAgeSeconds(token, now());
    if (maxAge === null) {
      return NextResponse.next();
    }

    // 既存セッションが分割Cookie(chunking)である場合、ベースCookieだけを
    // 書き換えると古いチャンクが残り次回の復号に失敗する。Proxyは分割Cookieの
    // 更新・削除に対応していないため、書き換え自体を諦める。
    const hasExistingChunkedCookie = req.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith(`${SESSION_COOKIE_NAME}.`));
    if (hasExistingChunkedCookie) {
      return NextResponse.next();
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
      // Redis接続自体に失敗した場合も、既存のCookieを維持し次回再試行させる。
      return NextResponse.next();
    }

    if (result.kind === "transient_failure") {
      // 既存のCookieはそのままにし、次回のリクエストで再試行させる。
      return NextResponse.next();
    }

    const updatedToken: JWT =
      result.kind === "success"
        ? {
            ...token,
            discordAccessToken: result.token.accessToken,
            discordRefreshToken: result.token.refreshToken,
            discordExpiresAt: result.token.expiresAt
          }
        : {
            ...token,
            discordAccessToken: undefined,
            discordRefreshToken: undefined,
            discordExpiresAt: undefined
          };

    const encoded = await encode({ token: updatedToken, secret: env.NEXTAUTH_SECRET, maxAge });

    if (Buffer.byteLength(encoded, "utf8") > MAX_SINGLE_COOKIE_BYTES) {
      // 分割Cookie(chunking)には対応していないため、既存Cookieを壊さないよう
      // 書き換えを諦める。次回のリクエストで再試行される。
      return NextResponse.next();
    }

    // 同一リクエスト内でこの後実行されるSSR(layout.tsx)やtRPCのgetToken()が更新後の
    // 値を読めるよう、リクエスト自体のCookieも書き換える。
    req.cookies.set(SESSION_COOKIE_NAME, encoded);

    const response = NextResponse.next({ request: req });
    response.cookies.set(SESSION_COOKIE_NAME, encoded, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: secureCookie,
      maxAge
    });

    return response;
  };
}

export const proxy = createProxy();
