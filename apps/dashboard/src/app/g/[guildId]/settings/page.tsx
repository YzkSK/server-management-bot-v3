"use client";

import { useState } from "react";

import { CAP } from "@sm-bot/shared";
import type { GuildLogMode } from "@sm-bot/db";

import { hasCapabilityFromWireString } from "../../../../lib/use-capability";
import { trpc } from "../../../../trpc-client";
import { SettingsPageView, type SettingsPageState } from "./settings-view";

export interface LogModeQueryResult {
  data: { logMode: GuildLogMode } | undefined;
  error: { message: string } | null;
  isFetching: boolean;
}

export function deriveSettingsPageState(input: {
  // undefined = 権限確認中(まだ判定できない)。boolean確定後に
  // "no-permission" / 通常フローへ分岐する。
  canManageLoggingSettings: boolean | undefined;
  query: LogModeQueryResult;
  // 直近の保存成功で確定したlogMode。setLogModeのレスポンスから設定され、
  // 保存後のrefetchが失敗してquery.dataが古いままでもUIが正しい値を表示できるようにする。
  confirmedLogMode: GuildLogMode | null;
  selectedLogMode: GuildLogMode | null;
  isSaving: boolean;
  saveError: string | null;
}): SettingsPageState {
  if (input.canManageLoggingSettings === undefined) {
    return { kind: "loading" };
  }

  if (!input.canManageLoggingSettings) {
    return { kind: "no-permission" };
  }

  const logMode = input.confirmedLogMode ?? input.query.data?.logMode;

  if (logMode !== undefined) {
    return {
      kind: "loaded",
      logMode,
      selectedLogMode: input.selectedLogMode ?? logMode,
      isSaving: input.isSaving,
      saveError: input.saveError
    };
  }

  if (input.query.error) {
    return { kind: "error", message: input.query.error.message, isRetrying: input.query.isFetching };
  }

  return { kind: "loading" };
}

export default function GuildSettingsPage() {
  const meQuery = trpc.dashboardAccess.me.useQuery();
  const canManageLoggingSettings = meQuery.isLoading
    ? undefined
    : hasCapabilityFromWireString(meQuery.data?.capabilities, CAP.MANAGE_LOGGING_SETTINGS);

  const [selectedLogMode, setSelectedLogMode] = useState<GuildLogMode | null>(null);
  const [confirmedLogMode, setConfirmedLogMode] = useState<GuildLogMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const query = trpc.logs.getLogMode.useQuery(undefined, {
    enabled: canManageLoggingSettings === true
  });
  const mutation = trpc.logs.setLogMode.useMutation();

  const state = deriveSettingsPageState({
    canManageLoggingSettings,
    query,
    confirmedLogMode,
    selectedLogMode,
    isSaving: mutation.isPending,
    saveError
  });

  function handleSave() {
    if (state.kind !== "loaded") return;
    const requestedLogMode = state.selectedLogMode;
    setSaveError(null);
    mutation.mutate(
      { logMode: requestedLogMode },
      {
        onSuccess: (result) => {
          // ミューテーションのレスポンスを確定値として即座に反映する。
          // refetch()が失敗しても、保存成功自体はUIに正しく反映され続ける。
          setConfirmedLogMode(result.logMode);
          setSelectedLogMode((current) => (current === requestedLogMode ? null : current));
          void query.refetch();
        },
        onError: (error) => setSaveError(error.message)
      }
    );
  }

  return (
    <SettingsPageView
      state={state}
      onLogModeChange={setSelectedLogMode}
      onSave={handleSave}
      onRetry={() => query.refetch()}
    />
  );
}
