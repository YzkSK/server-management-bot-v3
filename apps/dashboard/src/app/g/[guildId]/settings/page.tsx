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

  if (input.query.data) {
    return {
      kind: "loaded",
      logMode: input.query.data.logMode,
      selectedLogMode: input.selectedLogMode ?? input.query.data.logMode,
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
  const [saveError, setSaveError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const query = trpc.logs.getLogMode.useQuery(undefined, {
    enabled: canManageLoggingSettings === true
  });
  const mutation = trpc.logs.setLogMode.useMutation();

  const state = deriveSettingsPageState({
    canManageLoggingSettings,
    query,
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
          // ミューテーションのレスポンスでクエリキャッシュ自体を直接更新する。
          // query.dataが即座に権威ある最新値になるため、refetch()が失敗しても
          // 保存結果はUIに残り続け、かつ後で本当にサーバー側の値が変わった
          // (別の管理者が変更した等)場合もその後のrefetchで自然に追従できる
          // (confirmedLogModeのような別状態を持たないため、古い値がUIに
          // 永続的に居座ることがない)。
          utils.logs.getLogMode.setData(undefined, { logMode: result.logMode });
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
