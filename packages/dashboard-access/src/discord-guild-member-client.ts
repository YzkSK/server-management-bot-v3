const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_API_TIMEOUT_MS = 5000;

// 初回リクエスト + リトライ2回。429/5xxが続く場合はこの回数で諦める。
export const MAX_DISCORD_FETCH_ATTEMPTS = 3;
const DISCORD_BACKOFF_BASE_MS = 250;
const DISCORD_BACKOFF_MAX_MS = 4000;
// Retry-Afterヘッダーが欠落・不正な場合のフォールバック待機時間。
const DISCORD_DEFAULT_RETRY_AFTER_MS = 1000;
// Discordが極端に大きいRetry-Afterを返してもtRPCリクエストを無期限に
// 保持しないための上限(issue #122 codexレビュー指摘)。
export const DISCORD_MAX_RETRY_AFTER_MS = 10_000;

export class DiscordApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DiscordApiError";
  }
}

// Unknown Guild(code 10004)専用のエラー種別。呼び出し側はこれのみを
// 「アクセス不可のguildId」として扱ってよく、それ以外の404
// (未知のcodeや非JSONボディ)はこのクラスにはならず、通常のエラーとして
// 握り潰さずに伝播する(issue #138)。
export class DiscordUnknownGuildError extends DiscordApiError {
  constructor(guildId: string) {
    super(`Unknown Discord guild (${guildId}).`, 404);
    this.name = "DiscordUnknownGuildError";
  }
}

export interface DiscordGuildMemberAccess {
  roleIds: string[];
  isGuildOwner: boolean;
}

export interface FetchGuildMemberAccessInput {
  botToken: string;
  guildId: string;
  userId: string;
}

interface DiscordGuildMemberResponse {
  roles: string[];
}

interface DiscordGuildResponse {
  owner_id: string;
}

interface DiscordErrorResponse {
  code?: number;
}

// メンバー脱退済み(既知のケースのみnullを返す)。それ以外の404
// (guildId設定ミスのUnknown Guildや未知のcode)はDiscordApiErrorとして
// 投げ、サイレントに握り潰さないようにする(issue #123)。
const DISCORD_UNKNOWN_MEMBER_ERROR_CODE = 10007;
const DISCORD_UNKNOWN_GUILD_ERROR_CODE = 10004;

function botAuthHeaders(botToken: string) {
  return { Authorization: `Bot ${botToken}` };
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function parseRetryAfterMs(response: Response): number {
  const header = response.headers.get("Retry-After")?.trim();
  const seconds = header ? Number(header) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DISCORD_DEFAULT_RETRY_AFTER_MS;
  }
  return Math.min(seconds * 1000, DISCORD_MAX_RETRY_AFTER_MS);
}

function exponentialBackoffMs(attempt: number): number {
  return Math.min(DISCORD_BACKOFF_BASE_MS * 2 ** attempt, DISCORD_BACKOFF_MAX_MS);
}

// 429はRetry-Afterに従い、5xxは上限付き指数バックオフでリトライする
// (issue #122)。404や他の4xxはリトライ対象外で即座に返す。
async function fetchWithRetry(url: string, botToken: string): Promise<Response> {
  let response: Response;
  for (let attempt = 0; attempt < MAX_DISCORD_FETCH_ATTEMPTS; attempt += 1) {
    response = await fetch(url, {
      headers: botAuthHeaders(botToken),
      signal: AbortSignal.timeout(DISCORD_API_TIMEOUT_MS)
    });

    const isRetryable = response.status === 429 || response.status >= 500;
    if (!isRetryable || attempt === MAX_DISCORD_FETCH_ATTEMPTS - 1) {
      return response;
    }

    const delayMs =
      response.status === 429 ? parseRetryAfterMs(response) : exponentialBackoffMs(attempt);
    // 未消費のbodyを破棄し、リトライ時に接続を確実に解放する(issue #122 codexレビュー指摘)。
    await response.body?.cancel();
    await sleep(delayMs);
  }
  // MAX_DISCORD_FETCH_ATTEMPTS >= 1 のため到達しないが、型のために必要。
  return response!;
}

export interface DiscordGuildInfo {
  id: string;
  name: string;
}

// guildの単独lookup(GET /guilds/{id})の404を分類する共通処理。
// code 10004(Unknown Guild)のみをDiscordUnknownGuildErrorとして扱い、
// それ以外の未知codeや非JSONボディはログを残してから通常のエラーとして
// 投げる(issue #138)。fetchGuildInfoとfetchGuildMemberAccessの両方の
// guild lookupで共有する。
async function throwForGuildLookup404(response: Response, guildId: string): Promise<never> {
  const body = (await response.json().catch(() => null)) as DiscordErrorResponse | null;
  if (body?.code === DISCORD_UNKNOWN_GUILD_ERROR_CODE) {
    throw new DiscordUnknownGuildError(guildId);
  }
  console.error(
    `[dashboard-access] Unexpected 404 from Discord guild lookup (guildId=${guildId}, code=${body?.code ?? "unknown"}).`
  );
  throw new DiscordApiError(
    `Unexpected 404 from Discord guild lookup (code: ${body?.code ?? "unknown"}).`,
    404
  );
}

// guild名表示のためだけに、guildの基本情報を単独で取得する軽量版
// (メンバー権限解決とは無関係に呼び出せる)。
export async function fetchGuildInfo(botToken: string, guildId: string): Promise<DiscordGuildInfo> {
  const response = await fetchWithRetry(`${DISCORD_API_BASE_URL}/guilds/${guildId}`, botToken);

  if (response.status === 404) {
    await throwForGuildLookup404(response, guildId);
  }

  if (!response.ok) {
    // 未消費のbodyを破棄して接続を確実に解放する(fetchWithRetry内のリトライ時と同じ理由)。
    await response.body?.cancel();
    throw new DiscordApiError(`Failed to load Discord guild (${response.status}).`, response.status);
  }

  const guild = (await response.json()) as { id: string; name: string };
  return { id: guild.id, name: guild.name };
}

// Discord's member endpoint doesn't expose owner status, so the guild is
// fetched in parallel to compare owner_id against the caller.
export async function fetchGuildMemberAccess(
  input: FetchGuildMemberAccessInput
): Promise<DiscordGuildMemberAccess | null> {
  const [memberResponse, guildResponse] = await Promise.all([
    fetchWithRetry(
      `${DISCORD_API_BASE_URL}/guilds/${input.guildId}/members/${input.userId}`,
      input.botToken
    ),
    fetchWithRetry(`${DISCORD_API_BASE_URL}/guilds/${input.guildId}`, input.botToken)
  ]);

  if (memberResponse.status === 404) {
    const body = (await memberResponse.json().catch(() => null)) as DiscordErrorResponse | null;
    // memberResponseの404が確定した時点でguildResponseは使わないため、未消費の
    // bodyを破棄して接続を解放する(codexレビュー指摘: issue #138)。
    await guildResponse.body?.cancel();
    if (body?.code === DISCORD_UNKNOWN_MEMBER_ERROR_CODE) {
      return null;
    }
    if (body?.code === DISCORD_UNKNOWN_GUILD_ERROR_CODE) {
      throw new DiscordUnknownGuildError(input.guildId);
    }
    // 未知のcodeや非JSONボディの404は想定外のため、サイレントに
    // Unknown Guild扱いされないようログを残してから伝播する(issue #138)。
    console.error(
      `[dashboard-access] Unexpected 404 from Discord guild member lookup (guildId=${input.guildId}, code=${body?.code ?? "unknown"}).`
    );
    throw new DiscordApiError(
      `Unexpected 404 from Discord guild member lookup (code: ${body?.code ?? "unknown"}).`,
      404
    );
  }
  if (!memberResponse.ok) {
    await memberResponse.body?.cancel();
    await guildResponse.body?.cancel();
    throw new DiscordApiError(
      `Failed to load Discord guild member (${memberResponse.status}).`,
      memberResponse.status
    );
  }
  if (guildResponse.status === 404) {
    // guildResponseの404が確定した時点でmemberResponseは使わないため、未消費の
    // bodyを破棄して接続を解放する(codexレビュー指摘: issue #138)。
    await memberResponse.body?.cancel();
    await throwForGuildLookup404(guildResponse, input.guildId);
  }
  if (!guildResponse.ok) {
    await memberResponse.body?.cancel();
    await guildResponse.body?.cancel();
    throw new DiscordApiError(
      `Failed to load Discord guild (${guildResponse.status}).`,
      guildResponse.status
    );
  }

  const member = (await memberResponse.json()) as DiscordGuildMemberResponse;
  const guild = (await guildResponse.json()) as DiscordGuildResponse;

  // Discord's member.roles never includes @everyone (its role id equals the
  // guild id), but dashboard_access_grants stores the everyone baseline as a
  // role-target grant keyed by that id (see ensureEveryoneBaselineGrant).
  return {
    roleIds: [...new Set([input.guildId, ...member.roles])],
    isGuildOwner: guild.owner_id === input.userId
  };
}
