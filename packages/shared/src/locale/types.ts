export type Locale = {
  guildShell: {
    switchServer: string;
    serverSettings: string;
  };
  guildSelector: {
    loadFailed: string;
  };
  settings: {
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
    loadFailed: string;
    retrying: string;
    retry: string;
    newLogsCount: (vars: { count: number }) => string;
  };
};
