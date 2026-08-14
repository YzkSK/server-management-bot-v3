import type { Locale } from "./types.js";

export const en: Locale = {
  guildShell: {
    switchServer: "Switch server",
    serverSettings: "Server settings"
  },
  guildSelector: {
    loading: "Loading...",
    loadFailed: "Failed to load the guild list.",
    empty: "No accessible guilds found."
  },
  settings: {
    loading: "Loading...",
    noPermission: "You don't have permission to change this setting.",
    loadFailed: "Failed to load settings.",
    retrying: "Retrying…",
    retry: "Retry",
    logModeHeading: "Log recording mode",
    logModeFull: "Record with message content",
    logModeMetadataOnly: "Record without message content",
    logModeDisabled: "Don't record",
    saving: "Saving…",
    save: "Save",
    languageHeading: "Language",
    languageOptionJa: "日本語",
    languageOptionEn: "English"
  },
  logs: {
    loading: "Loading...",
    loadFailed: "Failed to load logs.",
    retrying: "Retrying…",
    retry: "Retry",
    newLogsCount: ({ count }) => `${count} new ↑`,
    viewModeHuman: "Human View",
    viewModeRaw: "Raw JSON",
    viewModeGroupLabel: "View mode",
    connectionIdle: "Idle",
    connectionConnecting: "Connecting…",
    connectionLive: "Live",
    connectionOffline: "Offline",
    connectionError: "Error",
    realtimeStatusLabel: ({ status }) => `Realtime status: ${status}`,
    loadingMore: "Loading…",
    loadMore: "Load more"
  }
};
