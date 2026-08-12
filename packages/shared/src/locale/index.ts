export * from "./guild-language.js";
export type { Locale } from "./types.js";

import type { GuildLanguage } from "./guild-language.js";
import type { Locale } from "./types.js";
import { en } from "./locale.en.js";
import { ja } from "./locale.ja.js";

const locales: Record<GuildLanguage, Locale> = { en, ja };

export function getLocale(lang: GuildLanguage): Locale {
  return locales[lang];
}
