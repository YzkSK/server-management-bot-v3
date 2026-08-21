export const guildLanguages = ["ja", "en"] as const;
export type GuildLanguage = (typeof guildLanguages)[number];

export function isGuildLanguage(value: string): value is GuildLanguage {
  return (guildLanguages as readonly string[]).includes(value);
}
