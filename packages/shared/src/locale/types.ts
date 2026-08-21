import type { LogCategory } from "../log-categories.js";

export type Locale = {
  guildShell: {
    switchServer: string;
    serverSettings: string;
  };
  guildSelector: {
    loading: string;
    loadFailed: string;
    empty: string;
  };
  settings: {
    loading: string;
    noPermission: string;
    loadFailed: string;
    retrying: string;
    retry: string;
    logModeHeading: string;
    logModeFull: string;
    logModeMetadataOnly: string;
    logModeDisabled: string;
    saving: string;
    save: string;
    languageHeading: string;
    languageOptionJa: string;
    languageOptionEn: string;
  };
  logs: {
    category: Record<LogCategory, string>;
    loading: string;
    loadFailed: string;
    retrying: string;
    retry: string;
    newLogsCount: (vars: { count: number }) => string;
    viewModeHuman: string;
    viewModeRaw: string;
    viewModeGroupLabel: string;
    connectionIdle: string;
    connectionConnecting: string;
    connectionLive: string;
    connectionOffline: string;
    connectionError: string;
    realtimeStatusLabel: (vars: { status: string }) => string;
    loadingMore: string;
    loadMore: string;
    attachmentsCount: (vars: { count: number }) => string;
  };
};
