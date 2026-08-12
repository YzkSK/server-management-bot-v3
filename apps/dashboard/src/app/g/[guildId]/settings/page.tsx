"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { CAP, type GuildLanguage } from "@sm-bot/shared";
import type { GuildLogMode } from "@sm-bot/db";

import { useLocale } from "../../../../lib/locale-context";
import { hasCapabilityFromWireString } from "../../../../lib/use-capability";
import { trpc } from "../../../../trpc-client";
import {
  SettingsPageView,
  type SettingsPageState,
  type SettingsSectionState
} from "./settings-view";

export interface SectionQueryResult<TValue> {
  data: TValue | undefined;
  error: { message: string } | null;
  isFetching: boolean;
}

export function deriveSectionState<TValue>(input: {
  canManage: boolean | undefined;
  query: SectionQueryResult<TValue>;
  selected: TValue | null;
  isSaving: boolean;
  saveError: string | null;
}): SettingsSectionState<TValue> {
  if (input.canManage === false) {
    return { kind: "hidden" };
  }

  if (input.canManage === undefined) {
    return { kind: "loading" };
  }

  if (input.query.data !== undefined) {
    return {
      kind: "ready",
      value: input.query.data,
      selected: input.selected ?? input.query.data,
      isSaving: input.isSaving,
      saveError: input.saveError
    };
  }

  if (input.query.error) {
    return { kind: "error", message: input.query.error.message, isRetrying: input.query.isFetching };
  }

  return { kind: "loading" };
}

export function deriveSettingsPageState(input: {
  canManageLoggingSettings: boolean | undefined;
  canManageGuildSettings: boolean | undefined;
  permissionCheckError?: { message: string } | null;
  permissionCheckIsFetching?: boolean;
  logModeQuery: SectionQueryResult<GuildLogMode>;
  selectedLogMode: GuildLogMode | null;
  isSavingLogMode: boolean;
  logModeSaveError: string | null;
  languageQuery: SectionQueryResult<GuildLanguage>;
  selectedLanguage: GuildLanguage | null;
  isSavingLanguage: boolean;
  languageSaveError: string | null;
}): SettingsPageState {
  if (input.canManageLoggingSettings === undefined || input.canManageGuildSettings === undefined) {
    if (input.permissionCheckError) {
      return {
        kind: "error",
        message: input.permissionCheckError.message,
        isRetrying: input.permissionCheckIsFetching ?? false
      };
    }
    return { kind: "loading" };
  }

  if (!input.canManageLoggingSettings && !input.canManageGuildSettings) {
    return { kind: "no-permission" };
  }

  return {
    kind: "loaded",
    logMode: deriveSectionState({
      canManage: input.canManageLoggingSettings,
      query: input.logModeQuery,
      selected: input.selectedLogMode,
      isSaving: input.isSavingLogMode,
      saveError: input.logModeSaveError
    }),
    language: deriveSectionState({
      canManage: input.canManageGuildSettings,
      query: input.languageQuery,
      selected: input.selectedLanguage,
      isSaving: input.isSavingLanguage,
      saveError: input.languageSaveError
    })
  };
}

// 選択された記録モードを変更する際、直前の保存試行に対するsaveErrorは
// もはや意味を持たない(まだ再試行していないのに古いエラーが残り続けるのを防ぐ)。
export function nextSelection<TValue>(next: TValue): { selected: TValue; saveError: null } {
  return { selected: next, saveError: null };
}

export default function GuildSettingsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const locale = useLocale();
  const meQuery = trpc.dashboardAccess.me.useQuery({ guildId });

  const canManageLoggingSettings =
    meQuery.isLoading || meQuery.isError
      ? undefined
      : hasCapabilityFromWireString(meQuery.data?.capabilities, CAP.MANAGE_LOGGING_SETTINGS);
  const canManageGuildSettings =
    meQuery.isLoading || meQuery.isError
      ? undefined
      : hasCapabilityFromWireString(meQuery.data?.capabilities, CAP.MANAGE_GUILD_SETTINGS);

  const [selectedLogMode, setSelectedLogMode] = useState<GuildLogMode | null>(null);
  const [logModeSaveError, setLogModeSaveError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<GuildLanguage | null>(null);
  const [languageSaveError, setLanguageSaveError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const logModeQuery = trpc.logs.getLogMode.useQuery(
    { guildId },
    { enabled: canManageLoggingSettings === true }
  );
  const logModeMutation = trpc.logs.setLogMode.useMutation();
  const languageQuery = trpc.guildSettings.getLanguage.useQuery(
    { guildId },
    { enabled: canManageGuildSettings === true }
  );
  const languageMutation = trpc.guildSettings.setLanguage.useMutation();

  // logs.getLogMode/guildSettings.getLanguageのレスポンスは{ logMode }/{ language }で
  // ラップされているため、deriveSectionStateが期待する「素の値」の形に変換する。
  const logModeQueryResult: SectionQueryResult<GuildLogMode> = {
    data: logModeQuery.data?.logMode,
    error: logModeQuery.error ? { message: logModeQuery.error.message } : null,
    isFetching: logModeQuery.isFetching
  };
  const languageQueryResult: SectionQueryResult<GuildLanguage> = {
    data: languageQuery.data?.language,
    error: languageQuery.error ? { message: languageQuery.error.message } : null,
    isFetching: languageQuery.isFetching
  };

  const state = deriveSettingsPageState({
    canManageLoggingSettings,
    canManageGuildSettings,
    permissionCheckError: meQuery.error ? { message: meQuery.error.message } : null,
    permissionCheckIsFetching: meQuery.isFetching,
    logModeQuery: logModeQueryResult,
    selectedLogMode,
    isSavingLogMode: logModeMutation.isPending,
    logModeSaveError,
    languageQuery: languageQueryResult,
    selectedLanguage,
    isSavingLanguage: languageMutation.isPending,
    languageSaveError
  });

  function handleLogModeChange(nextLogMode: GuildLogMode) {
    const update = nextSelection(nextLogMode);
    setSelectedLogMode(update.selected);
    setLogModeSaveError(update.saveError);
  }

  function handleLogModeRetry() {
    if (meQuery.isError) {
      void meQuery.refetch();
      return;
    }
    void logModeQuery.refetch();
  }

  function handleLogModeSave() {
    if (state.kind !== "loaded" || state.logMode.kind !== "ready") return;
    const requestedLogMode = state.logMode.selected;
    setLogModeSaveError(null);
    logModeMutation.mutate(
      { logMode: requestedLogMode },
      {
        onSuccess: (result) => {
          utils.logs.getLogMode.setData({ guildId }, { logMode: result.logMode });
          setSelectedLogMode((current) => (current === requestedLogMode ? null : current));
          void logModeQuery.refetch();
        },
        onError: (error) => setLogModeSaveError(error.message)
      }
    );
  }

  function handleLanguageRetry() {
    if (meQuery.isError) {
      void meQuery.refetch();
      return;
    }
    void languageQuery.refetch();
  }

  function handleLanguageChange(nextLanguage: GuildLanguage) {
    setLanguageSaveError(null);
    setSelectedLanguage(nextLanguage);
    languageMutation.mutate(
      { language: nextLanguage },
      {
        onSuccess: (result) => {
          utils.guildSettings.getLanguage.setData({ guildId }, { language: result.language });
          setSelectedLanguage(null);
          void languageQuery.refetch();
        },
        onError: (error) => {
          setLanguageSaveError(error.message);
          setSelectedLanguage(null);
        }
      }
    );
  }

  function handleRetry() {
    void meQuery.refetch();
  }

  return (
    <SettingsPageView
      state={state}
      locale={locale}
      onLogModeChange={handleLogModeChange}
      onLogModeSave={handleLogModeSave}
      onLogModeRetry={handleLogModeRetry}
      onLanguageChange={handleLanguageChange}
      onLanguageRetry={handleLanguageRetry}
      onRetry={handleRetry}
    />
  );
}
