"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

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
  // 権限確認クエリ(dashboardAccess.me)自体がエラーで終わった場合の情報。
  // isLoadingはエラー終了時もfalseになるため、canManageLoggingSettingsだけでは
  // 「権限なし」と「確認自体が失敗した」を区別できない。
  permissionCheckError?: { message: string } | null;
  permissionCheckIsFetching?: boolean;
  query: LogModeQueryResult;
  selectedLogMode: GuildLogMode | null;
  isSaving: boolean;
  saveError: string | null;
}): SettingsPageState {
  if (input.canManageLoggingSettings === undefined) {
    if (input.permissionCheckError) {
      return {
        kind: "error",
        message: input.permissionCheckError.message,
        isRetrying: input.permissionCheckIsFetching ?? false
      };
    }
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

// 選択された記録モードを変更する際、直前の保存試行に対するsaveErrorは
// もはや意味を持たない(まだ再試行していないのに古いエラーが残り続けるのを防ぐ)。
export function nextLogModeSelection(nextLogMode: GuildLogMode): {
  selectedLogMode: GuildLogMode;
  saveError: null;
} {
  return { selectedLogMode: nextLogMode, saveError: null };
}

export default function GuildSettingsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const meQuery = trpc.dashboardAccess.me.useQuery({ guildId });
  // isLoadingはクエリがエラーで終わった場合もfalseになるため、エラー時は
  // canManageLoggingSettingsをundefinedのままにし、no-permissionと誤判定しない。
  const canManageLoggingSettings =
    meQuery.isLoading || meQuery.isError
      ? undefined
      : hasCapabilityFromWireString(meQuery.data?.capabilities, CAP.MANAGE_LOGGING_SETTINGS);

  const [selectedLogMode, setSelectedLogMode] = useState<GuildLogMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const query = trpc.logs.getLogMode.useQuery(
    { guildId },
    { enabled: canManageLoggingSettings === true }
  );
  const mutation = trpc.logs.setLogMode.useMutation();

  const state = deriveSettingsPageState({
    canManageLoggingSettings,
    permissionCheckError: meQuery.error ? { message: meQuery.error.message } : null,
    permissionCheckIsFetching: meQuery.isFetching,
    query,
    selectedLogMode,
    isSaving: mutation.isPending,
    saveError
  });

  function handleLogModeChange(nextLogMode: GuildLogMode) {
    const update = nextLogModeSelection(nextLogMode);
    setSelectedLogMode(update.selectedLogMode);
    setSaveError(update.saveError);
  }

  function handleRetry() {
    // エラーの原因が権限確認クエリ(meQuery)自体にある場合、まだ有効化されていない
    // (enabled: false の)ログ設定クエリまで手動refetchすると無関係なリクエストが
    // 発生してしまうため、原因のクエリだけを再試行する。
    if (meQuery.isError) {
      void meQuery.refetch();
      return;
    }
    void query.refetch();
  }

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
          utils.logs.getLogMode.setData({ guildId }, { logMode: result.logMode });
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
      onLogModeChange={handleLogModeChange}
      onSave={handleSave}
      onRetry={handleRetry}
    />
  );
}
