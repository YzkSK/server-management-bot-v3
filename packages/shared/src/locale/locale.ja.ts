import type { Locale } from "./types.js";

export const ja: Locale = {
  guildShell: {
    switchServer: "サーバーを切り替える",
    serverSettings: "サーバー設定"
  },
  guildSelector: {
    loadFailed: "ギルド一覧の取得に失敗しました。"
  },
  settings: {
    noPermission: "この設定を変更する権限がありません。",
    loadFailed: "設定の取得に失敗しました。",
    retrying: "再試行中…",
    retry: "再試行",
    logModeHeading: "ログ記録モード",
    logModeFull: "本文を含めて記録",
    logModeMetadataOnly: "本文を除いて記録",
    logModeDisabled: "記録しない",
    saving: "保存中…",
    save: "保存",
    languageHeading: "言語",
    languageOptionJa: "日本語",
    languageOptionEn: "English"
  },
  logs: {
    loadFailed: "ログの取得に失敗しました。",
    retrying: "再試行中…",
    retry: "再試行",
    newLogsCount: ({ count }) => `${count}件の新着 ↑`
  }
};
