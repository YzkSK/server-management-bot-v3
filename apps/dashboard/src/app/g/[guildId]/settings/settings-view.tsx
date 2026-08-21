import type { GuildLogMode } from "@sm-bot/db";

import { Button } from "../../../../components/ui/button";

const LOG_MODE_OPTIONS: readonly GuildLogMode[] = ["full", "metadata_only", "disabled"];

const LOG_MODE_LABELS: Record<GuildLogMode, string> = {
  full: "本文を含めて記録",
  metadata_only: "本文を除いて記録",
  disabled: "記録しない"
};

export type SettingsPageState =
  | { kind: "no-permission" }
  | { kind: "loading" }
  | { kind: "error"; message: string; isRetrying: boolean }
  | {
      kind: "loaded";
      logMode: GuildLogMode;
      selectedLogMode: GuildLogMode;
      isSaving: boolean;
      saveError: string | null;
    };

export function SettingsPageView({
  state,
  onLogModeChange,
  onSave,
  onRetry
}: {
  state: SettingsPageState;
  onLogModeChange: (logMode: GuildLogMode) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  if (state.kind === "no-permission") {
    return <p className="p-4 text-sm text-muted-foreground">この設定を変更する権限がありません。</p>;
  }

  if (state.kind === "loading") {
    return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;
  }

  if (state.kind === "error") {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-sm text-destructive">設定の取得に失敗しました。</p>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={state.isRetrying}>
            {state.isRetrying ? "再試行中…" : "再試行"}
          </Button>
        </div>
      </div>
    );
  }

  const isDirty = state.selectedLogMode !== state.logMode;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">ログ記録モード</h2>
        <div role="radiogroup" aria-label="ログ記録モード" className="mt-2 flex flex-col gap-2">
          {LOG_MODE_OPTIONS.map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="logMode"
                value={mode}
                checked={state.selectedLogMode === mode}
                onChange={() => onLogModeChange(mode)}
              />
              {LOG_MODE_LABELS[mode]}
            </label>
          ))}
        </div>
      </div>
      {state.saveError ? <p className="text-sm text-destructive">{state.saveError}</p> : null}
      <div>
        <Button type="button" size="sm" onClick={onSave} disabled={!isDirty || state.isSaving}>
          {state.isSaving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
