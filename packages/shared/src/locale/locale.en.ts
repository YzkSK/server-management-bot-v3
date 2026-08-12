import type { Locale } from "./types.js";

export const en: Locale = {
  guildShell: {
    switchServer: "Switch server",
    serverSettings: "Server settings"
  },
  guildSelector: {
    loadFailed: "Failed to load the guild list."
  },
  settings: {
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
    loadFailed: "Failed to load logs.",
    retrying: "Retrying…",
    retry: "Retry",
    newLogsCount: ({ count }) => `${count} new ↑`
  }
};
