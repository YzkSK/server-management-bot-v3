// httpBatchLinkはProviders生成時(useState初回)に一度だけ作られるため、
// guildId切り替えのたびにリンクを作り直さずに済むよう、Reactの外側で
// 保持するmutableな参照として管理する。
export const currentGuildIdRef: { current: string | null } = { current: null };

export function setCurrentGuildId(guildId: string | null): void {
  currentGuildIdRef.current = guildId;
}
