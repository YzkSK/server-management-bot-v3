"use client";

import { useState } from "react";

import { CAP } from "@sm-bot/shared";
import type { GuildLogMode } from "@sm-bot/db";

import { useCapability } from "../../../../lib/use-capability";
import { trpc } from "../../../../trpc-client";
import { SettingsPageView, type SettingsPageState } from "./settings-view";

export interface LogModeQueryResult {
  data: { logMode: GuildLogMode } | undefined;
  error: { message: string } | null;
  isFetching: boolean;
}

export function deriveSettingsPageState(input: {
  canManageLoggingSettings: boolean;
  query: LogModeQueryResult;
  selectedLogMode: GuildLogMode | null;
  isSaving: boolean;
  saveError: string | null;
}): SettingsPageState {
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
  const canManageLoggingSettings = useCapability(CAP.MANAGE_LOGGING_SETTINGS);
  const [selectedLogMode, setSelectedLogMode] = useState<GuildLogMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const query = trpc.logs.getLogMode.useQuery(undefined, { enabled: canManageLoggingSettings });
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
    setSaveError(null);
    mutation.mutate(
      { logMode: state.selectedLogMode },
      {
        onSuccess: () => {
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
