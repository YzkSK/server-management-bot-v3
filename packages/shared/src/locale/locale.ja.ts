import type { Locale } from "./types.js";

export const ja: Locale = {
  guildShell: {
    switchServer: "サーバーを切り替える",
    serverSettings: "サーバー設定"
  },
  guildSelector: {
    loading: "読み込み中...",
    loadFailed: "ギルド一覧の取得に失敗しました。",
    empty: "アクセスできるサーバーが見つかりません。"
  },
  settings: {
    loading: "読み込み中...",
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
    category: {
      all: "すべて",
      message: "メッセージ",
      member: "メンバー",
      audit: "監査",
      voice: "ボイス",
      temp_vc: "一時VC",
      recruitment: "募集",
      tts: "読み上げ",
      system: "システム",
      dashboard: "ダッシュボード"
    },
    loading: "読み込み中...",
    loadFailed: "ログの取得に失敗しました。",
    retrying: "再試行中…",
    retry: "再試行",
    newLogsCount: ({ count }) => `${count}件の新着 ↑`,
    viewModeHuman: "見やすい表示",
    viewModeRaw: "Raw JSON",
    viewModeGroupLabel: "表示モード",
    connectionIdle: "アイドル",
    connectionConnecting: "接続中…",
    connectionLive: "接続中",
    connectionOffline: "オフライン",
    connectionError: "エラー",
    realtimeStatusLabel: ({ status }) => `リアルタイム状態: ${status}`,
    loadingMore: "読み込み中…",
    loadMore: "もっと読み込む"
  }
};
