import type { GuildLogMode } from "@sm-bot/db";
import { guildLanguages, type GuildLanguage, type Locale } from "@sm-bot/shared";

import { Button } from "../../../../components/ui/button";

const LOG_MODE_OPTIONS: readonly GuildLogMode[] = ["full", "metadata_only", "disabled"];
const LANGUAGE_OPTIONS: readonly GuildLanguage[] = guildLanguages;

export type SettingsSectionState<TValue> =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "error"; message: string; isRetrying: boolean }
  | { kind: "ready"; value: TValue; selected: TValue; isSaving: boolean; saveError: string | null };

export type SettingsPageState =
  | { kind: "no-permission" }
  | { kind: "loading" }
  | { kind: "error"; message: string; isRetrying: boolean }
  | {
      kind: "loaded";
      logMode: SettingsSectionState<GuildLogMode>;
      language: SettingsSectionState<GuildLanguage>;
    };

export function SettingsPageView({
  state,
  locale,
  onLogModeChange,
  onLogModeSave,
  onLogModeRetry,
  onLanguageChange,
  onLanguageRetry,
  onRetry
}: {
  state: SettingsPageState;
  locale: Locale;
  onLogModeChange: (logMode: GuildLogMode) => void;
  onLogModeSave: () => void;
  onLogModeRetry: () => void;
  onLanguageChange: (language: GuildLanguage) => void;
  onLanguageRetry: () => void;
  onRetry: () => void;
}) {
  if (state.kind === "no-permission") {
    return <p className="p-4 text-sm text-muted-foreground">{locale.settings.noPermission}</p>;
  }

  if (state.kind === "loading") {
    return <p className="p-4 text-sm text-muted-foreground">{locale.settings.loading}</p>;
  }

  if (state.kind === "error") {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-sm text-destructive">{locale.settings.loadFailed}</p>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={state.isRetrying}>
            {state.isRetrying ? locale.settings.retrying : locale.settings.retry}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {state.logMode.kind !== "hidden" ? (
        <LogModeSection
          section={state.logMode}
          locale={locale}
          onChange={onLogModeChange}
          onSave={onLogModeSave}
          onRetry={onLogModeRetry}
        />
      ) : null}
      {state.language.kind !== "hidden" ? (
        <LanguageSection
          section={state.language}
          locale={locale}
          onChange={onLanguageChange}
          onRetry={onLanguageRetry}
        />
      ) : null}
    </div>
  );
}

function RetryableSection({
  locale,
  isRetrying,
  onRetry
}: {
  locale: Locale;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-destructive">{locale.settings.loadFailed}</p>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? locale.settings.retrying : locale.settings.retry}
        </Button>
      </div>
    </div>
  );
}

function LogModeSection({
  section,
  locale,
  onChange,
  onSave,
  onRetry
}: {
  section: Exclude<SettingsSectionState<GuildLogMode>, { kind: "hidden" }>;
  locale: Locale;
  onChange: (logMode: GuildLogMode) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  if (section.kind === "loading") {
    return <p className="text-sm text-muted-foreground">{locale.settings.loading}</p>;
  }

  if (section.kind === "error") {
    return <RetryableSection locale={locale} isRetrying={section.isRetrying} onRetry={onRetry} />;
  }

  const LOG_MODE_LABELS: Record<GuildLogMode, string> = {
    full: locale.settings.logModeFull,
    metadata_only: locale.settings.logModeMetadataOnly,
    disabled: locale.settings.logModeDisabled
  };

  const isDirty = section.selected !== section.value;

  return (
    <div>
      <h2 className="text-sm font-semibold">{locale.settings.logModeHeading}</h2>
      <div role="radiogroup" aria-label={locale.settings.logModeHeading} className="mt-2 flex flex-col gap-2">
        {LOG_MODE_OPTIONS.map((mode) => (
          <label key={mode} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="logMode"
              value={mode}
              checked={section.selected === mode}
              onChange={() => onChange(mode)}
            />
            {LOG_MODE_LABELS[mode]}
          </label>
        ))}
      </div>
      {section.saveError ? <p className="text-sm text-destructive">{section.saveError}</p> : null}
      <div className="mt-2">
        <Button type="button" size="sm" onClick={onSave} disabled={!isDirty || section.isSaving}>
          {section.isSaving ? locale.settings.saving : locale.settings.save}
        </Button>
      </div>
    </div>
  );
}

function LanguageSection({
  section,
  locale,
  onChange,
  onRetry
}: {
  section: Exclude<SettingsSectionState<GuildLanguage>, { kind: "hidden" }>;
  locale: Locale;
  onChange: (language: GuildLanguage) => void;
  onRetry: () => void;
}) {
  if (section.kind === "loading") {
    return <p className="text-sm text-muted-foreground">{locale.settings.loading}</p>;
  }

  if (section.kind === "error") {
    return <RetryableSection locale={locale} isRetrying={section.isRetrying} onRetry={onRetry} />;
  }

  const LANGUAGE_LABELS: Record<GuildLanguage, string> = {
    ja: locale.settings.languageOptionJa,
    en: locale.settings.languageOptionEn
  };

  return (
    <div>
      <h2 className="text-sm font-semibold">{locale.settings.languageHeading}</h2>
      <div
        role="radiogroup"
        aria-label={locale.settings.languageHeading}
        className="mt-2 flex flex-col gap-2"
      >
        {LANGUAGE_OPTIONS.map((language) => (
          <label key={language} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="language"
              value={language}
              checked={section.selected === language}
              disabled={section.isSaving}
              onChange={() => onChange(language)}
            />
            {LANGUAGE_LABELS[language]}
          </label>
        ))}
      </div>
      {section.saveError ? <p className="text-sm text-destructive">{section.saveError}</p> : null}
    </div>
  );
}
