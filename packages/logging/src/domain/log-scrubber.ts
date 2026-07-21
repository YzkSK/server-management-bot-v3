// Discord Bot Token / JWTはいずれも base64url 文字集合の3パートがドットで
// 連結された構造を持つ。先頭2パートは短め(6文字以上)、末尾の署名パートは
// 20文字以上という緩い長さ制約だけを課し、実在するトークン形式の揺れを吸収する。
// 添付ファイルURL等の一般的な文字列を誤って巻き込まないよう、この構造的特徴
// (3パート・ドット区切り)を満たすものだけを対象にする。
const TOKEN_LIKE_PATTERN =
  /\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g;

const BEARER_TOKEN_PATTERN = /\bBearer\s+\S{20,}/g;

// 区切りなしの13〜19桁の数字列、または実在のカード番号表記に多い
// 4桁ずつハイフン/スペース区切りの4グループ(計16桁)のいずれかにマッチする。
const CREDIT_CARD_PATTERN = /\b\d{13,19}\b|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/g;

const IPV4_PATTERN =
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

const IPV6_PATTERN = /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g;

function scrubString(value: string): string {
  return value
    .replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED_TOKEN]")
    .replace(TOKEN_LIKE_PATTERN, "[REDACTED_TOKEN]")
    .replace(IPV6_PATTERN, "[REDACTED_IP]")
    .replace(IPV4_PATTERN, "[REDACTED_IP]")
    .replace(CREDIT_CARD_PATTERN, "[REDACTED_CARD]");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (value !== null && typeof value === "object") {
    return scrubSensitiveStrings(value as Record<string, unknown>);
  }
  return value;
}

export function scrubSensitiveStrings(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key] = scrubValue(value);
  }
  return result;
}
