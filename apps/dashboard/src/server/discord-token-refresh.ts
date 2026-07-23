import { createHash, randomUUID } from "node:crypto";

const DISCORD_TOKEN_ENDPOINT = "https://discord.com/api/v10/oauth2/token";
const DISCORD_API_TIMEOUT_MS = 5000;

// Discord呼び出し(最大DISCORD_API_TIMEOUT_MS)に加え、Redisへの結果書き込みや
// イベントループの遅延も見込んで、ロック保持者が確実に完了できるだけの余裕を持たせる。
const LOCK_TTL_SECONDS = 15;
const RESULT_CACHE_TTL_SECONDS = 30;
const POLL_INTERVAL_MS = 200;
// ロック保持者が結果を書き込むまで、待機側がロックTTLより先にタイムアウトしないよう
// LOCK_TTL_SECONDSより大きい値にする。
const MAX_WAIT_MS = 20_000;

// アクセストークンの実際の失効時刻ちょうどまで待つと、リクエスト処理中に
// 失効してしまう恐れがあるため、この分だけ早めにリフレッシュを開始する。
export const DISCORD_TOKEN_REFRESH_SKEW_MS = 60_000;

export interface DiscordTokenRefreshCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number; NX?: true }): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

export interface RefreshedDiscordToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export type DiscordTokenRefreshResult =
  | { kind: "success"; token: RefreshedDiscordToken }
  // Discordがrefresh_tokenを拒否した(失効・使用済み等)。呼び出し側はDiscordトークンの
  // 状態をクリアし、再ログイン導線に委ねるべき。
  | { kind: "invalid_grant" }
  // ネットワーク断・timeout・5xx/429・不正なレスポンス等。既存のDiscordトークンを
  // 破棄せず、次回のリクエストで再試行させるべき。
  | { kind: "transient_failure" };

type CachedResult = Extract<DiscordTokenRefreshResult, { kind: "success" | "invalid_grant" }>;

interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RefreshDiscordAccessTokenInput {
  cache: DiscordTokenRefreshCacheClient;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

function lockKeyFor(refreshToken: string): string {
  return `dashboard:discord-token-refresh:lock:${createHash("sha256").update(refreshToken).digest("hex")}`;
}

function resultKeyFor(refreshToken: string): string {
  return `dashboard:discord-token-refresh:result:${createHash("sha256").update(refreshToken).digest("hex")}`;
}

function isRefreshedDiscordToken(value: unknown): value is RefreshedDiscordToken {
  return (
    typeof value === "object" &&
    value !== null &&
    "accessToken" in value &&
    typeof value.accessToken === "string" &&
    "refreshToken" in value &&
    typeof value.refreshToken === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "number"
  );
}

function parseCachedResult(value: string): CachedResult | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || !("kind" in parsed)) return null;

    if (parsed.kind === "invalid_grant") {
      return { kind: "invalid_grant" };
    }
    if (parsed.kind === "success" && "token" in parsed && isRefreshedDiscordToken(parsed.token)) {
      return { kind: "success", token: parsed.token };
    }
  } catch {
    // 破損したキャッシュ値はミスとして扱い、Discordへの再取得に委ねる
  }
  return null;
}

function isValidDiscordTokenResponse(value: unknown): value is DiscordTokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "access_token" in value &&
    typeof value.access_token === "string" &&
    value.access_token.length > 0 &&
    "refresh_token" in value &&
    typeof value.refresh_token === "string" &&
    value.refresh_token.length > 0 &&
    "expires_in" in value &&
    typeof value.expires_in === "number" &&
    Number.isFinite(value.expires_in) &&
    value.expires_in > 0
  );
}

async function requestDiscordTokenRefresh(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  now: () => number;
  fetchImpl: typeof fetch;
}): Promise<DiscordTokenRefreshResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret
  });

  let response: Response;
  try {
    response = await input.fetchImpl(DISCORD_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(DISCORD_API_TIMEOUT_MS)
    });
  } catch {
    return { kind: "transient_failure" };
  }

  if (!response.ok) {
    if (response.status === 400) {
      try {
        const errorBody: unknown = await response.json();
        if (
          typeof errorBody === "object" &&
          errorBody !== null &&
          "error" in errorBody &&
          errorBody.error === "invalid_grant"
        ) {
          return { kind: "invalid_grant" };
        }
      } catch {
        // 本文が解釈できない場合はtransient_failureとして扱う
      }
    }
    return { kind: "transient_failure" };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { kind: "transient_failure" };
  }

  if (!isValidDiscordTokenResponse(data)) {
    return { kind: "transient_failure" };
  }

  return {
    kind: "success",
    token: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(input.now() / 1000) + data.expires_in
    }
  };
}

// Discordのrefresh_tokenは一度使うとローテーション(失効)されるため、同一の
// refresh_tokenに対して複数リクエストが同時にリフレッシュを試みると、後発の
// 呼び出しは古いrefresh_tokenでの再試行となり失敗する。RedisのSET NX(ロック)で
// 先着1件だけがDiscordへリフレッシュを実行し、結果(成功/invalid_grant)を短命
// キャッシュに書き込むことで、後発リクエストはDiscordへ再度リクエストを送らず
// その結果を再利用する。ロックは所有者トークンで確認した上でのみ解放し(TTL経過後の
// 新しいロック保持者を誤って解放しないため)、ロック取得に失敗した側は結果キャッシュを
// ポーリングして待つ。待機タイムアウトやネットワーク断等はtransient_failureとして返し、
// 呼び出し側は既存のDiscordトークンを破棄せず次回再試行できるようにする。
export async function refreshDiscordAccessToken(
  input: RefreshDiscordAccessTokenInput
): Promise<DiscordTokenRefreshResult> {
  const now = input.now ?? (() => Date.now());
  const wait = input.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const fetchImpl = input.fetchImpl ?? fetch;

  const resultKey = resultKeyFor(input.refreshToken);

  // Redis自体はロック/結果共有による重複リフレッシュ抑止のための補助であり、
  // Redis障害でユーザーのセッションを失わせるべきではないため、cache呼び出しの失敗は
  // すべてtransient_failure(既存トークンを維持し次回再試行)として扱う。
  let cached: string | null;
  try {
    cached = await input.cache.get(resultKey);
  } catch {
    return { kind: "transient_failure" };
  }
  if (cached !== null) {
    const parsed = parseCachedResult(cached);
    if (parsed) return parsed;
  }

  const lockKey = lockKeyFor(input.refreshToken);
  const owner = randomUUID();
  let acquired: string | null;
  try {
    acquired = await input.cache.set(lockKey, owner, { EX: LOCK_TTL_SECONDS, NX: true });
  } catch {
    return { kind: "transient_failure" };
  }

  if (acquired === null) {
    const deadline = now() + MAX_WAIT_MS;
    while (now() < deadline) {
      await wait(POLL_INTERVAL_MS);
      let polled: string | null;
      try {
        polled = await input.cache.get(resultKey);
      } catch {
        return { kind: "transient_failure" };
      }
      if (polled !== null) {
        const parsed = parseCachedResult(polled);
        if (parsed) return parsed;
      }
    }
    return { kind: "transient_failure" };
  }

  try {
    const outcome = await requestDiscordTokenRefresh({
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      now,
      fetchImpl
    });

    if (outcome.kind !== "transient_failure") {
      try {
        await input.cache.set(resultKey, JSON.stringify(outcome), { EX: RESULT_CACHE_TTL_SECONDS });
      } catch {
        // 結果の共有キャッシュへの書き込みに失敗しても、この呼び出し自身が得た結果は
        // そのまま呼び出し元へ返す(他の待機者は待機タイムアウト後にtransient_failureへ)。
      }
    }

    return outcome;
  } finally {
    try {
      // cache.evalはRedisのEVALコマンド(サーバー側でLuaスクリプトを実行するAPI)であり、
      // JavaScriptのeval()とは無関係。所有者トークンが一致する場合のみ削除する
      // compare-and-deleteをRedis側でアトミックに行うために使用している。失敗しても
      // ロックはTTLで自然に解放されるため、リフレッシュ結果自体には影響させない。
      await input.cache.eval(RELEASE_LOCK_SCRIPT, { keys: [lockKey], arguments: [owner] });
    } catch {
      // TTL失効に委ねる
    }
  }
}

export function shouldRefreshDiscordToken(discordExpiresAt: number, now: () => number = () => Date.now()): boolean {
  return now() >= discordExpiresAt * 1000 - DISCORD_TOKEN_REFRESH_SKEW_MS;
}
