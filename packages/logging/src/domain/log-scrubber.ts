// Discord Bot Token / JWTはいずれも base64url 文字集合の3パートがドットで
// 連結された構造を持つ。先頭2パートは短め(6文字以上)、末尾の署名パートは
// 20文字以上という緩い長さ制約だけを課し、実在するトークン形式の揺れを吸収する。
// 添付ファイルURL等の一般的な文字列を誤って巻き込まないよう、この構造的特徴
// (3パート・ドット区切り)を満たすものだけを対象にする。
// 文字集合に`-`(非単語文字)を含むため、\bでは先頭/末尾が`-`のトークンで
// 境界を正しく認識できない(IPv6パターンと同種の既知の落とし穴)。そのため
// 境界判定は\bではなく「直前/直後が対象の文字集合(英数字・_・-)でないこと」を
// 明示するlookaround((?<![A-Za-z0-9_-]) / (?![A-Za-z0-9_-]))で行う。
const TOKEN_LIKE_PATTERN =
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g;

const BEARER_TOKEN_PATTERN = /\bBearer\s+\S{20,}/g;

// 区切り(スペース/ハイフン)を挟んでもよい13〜19桁の数字列にマッチする「候補」。
// 4-4-4-4(Visa/Mastercard等)だけでなく、AMEXの4-6-5のような他の実在する
// 区切りグルーピングも取りこぼさないよう、特定のグルーピング形を固定せず
// 桁数の範囲だけで候補を広く拾う。DiscordのスノーフレークID(17〜19桁)は
// `<@123456789012345678>` のようなメンション内に頻出し、この桁数だけの形状では
// カード番号と区別できない。そのため、この正規表現はあくまで候補抽出に留め、
// 実際にマスクするかどうかは Luhn チェックサム(下記 isValidLuhn)で検証する。
// スノーフレークIDがLuhnを通る確率は実質無視できるため、これにより誤検出を
// 除去しつつ本物のカード番号検出(区切りグルーピングによらず)は維持できる。
const CREDIT_CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;

const IPV4_PATTERN =
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

// IPv6の完全形(8グループ)に加え、`::` による0グループ省略形(`::1`, `fe80::1` 等)
// にも対応する。この順序は意図的なもので、代替(|)の並び順を変えると
// `fe80::1` のような省略形を大域(g)・非アンカーの検索で取りこぼす既知の
// 落とし穴があるため、この順序を変更しないこと。
// 先頭が`::`で始まるアドレス(`::1`等)は最初の文字自体が非単語文字(`:`)のため、
// \b(単語境界)では直前が行頭・空白・記号の場合に境界と認識されずマッチ漏れする。
// そのため境界判定は\bではなく「直前/直後が`:`または単語文字でないこと」を
// 明示するlookaround((?<![:\w]) / (?![:\w]))で行う。
const IPV6_SEGMENT = "[A-Fa-f0-9]{1,4}";
const IPV6_PATTERN = new RegExp(
  "(?<![:\\w])(?:" +
    `(?:${IPV6_SEGMENT}:){7}${IPV6_SEGMENT}` +
    "|" +
    `(?:${IPV6_SEGMENT}:){1,6}:${IPV6_SEGMENT}` +
    "|" +
    `(?:${IPV6_SEGMENT}:){1,5}(?::${IPV6_SEGMENT}){1,2}` +
    "|" +
    `(?:${IPV6_SEGMENT}:){1,4}(?::${IPV6_SEGMENT}){1,3}` +
    "|" +
    `(?:${IPV6_SEGMENT}:){1,3}(?::${IPV6_SEGMENT}){1,4}` +
    "|" +
    `(?:${IPV6_SEGMENT}:){1,2}(?::${IPV6_SEGMENT}){1,5}` +
    "|" +
    `${IPV6_SEGMENT}:(?:(?::${IPV6_SEGMENT}){1,6})` +
    "|" +
    `:(?:(?::${IPV6_SEGMENT}){1,7}|:)` +
    ")(?![:\\w])",
  "g"
);

// 標準的なLuhnアルゴリズム: 右端から数えて偶数番目(0始まりで奇数インデックス)の
// 桁を2倍し、9を超えたら9を引いてから全桁を合計する。合計が10で割り切れれば有効。
function isValidLuhn(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function maskCreditCardCandidate(match: string): string {
  const digitsOnly = match.replace(/[ -]/g, "");
  return isValidLuhn(digitsOnly) ? "[REDACTED_CARD]" : match;
}

function scrubString(value: string): string {
  return value
    .replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED_TOKEN]")
    .replace(TOKEN_LIKE_PATTERN, "[REDACTED_TOKEN]")
    .replace(IPV6_PATTERN, "[REDACTED_IP]")
    .replace(IPV4_PATTERN, "[REDACTED_IP]")
    .replace(CREDIT_CARD_CANDIDATE_PATTERN, maskCreditCardCandidate);
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
