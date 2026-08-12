import { describe, expect, test } from "bun:test";

import {
  deriveSectionState,
  deriveSettingsPageState,
  nextSelection,
  type SectionQueryResult
} from "./page";

const NOT_FETCHED: SectionQueryResult<never> = { data: undefined, error: null, isFetching: false };

describe("deriveSectionState", () => {
  test("returns hidden when the caller lacks the capability", () => {
    expect(
      deriveSectionState({ canManage: false, query: NOT_FETCHED, selected: null, isSaving: false, saveError: null })
    ).toEqual({ kind: "hidden" });
  });

  test("returns loading while capability is unknown", () => {
    expect(
      deriveSectionState({ canManage: undefined, query: NOT_FETCHED, selected: null, isSaving: false, saveError: null })
    ).toEqual({ kind: "loading" });
  });

  test("returns loading while the initial fetch is in flight", () => {
    expect(
      deriveSectionState({ canManage: true, query: NOT_FETCHED, selected: null, isSaving: false, saveError: null })
    ).toEqual({ kind: "loading" });
  });

  test("returns error when the initial fetch fails", () => {
    expect(
      deriveSectionState({
        canManage: true,
        query: { data: undefined, error: { message: "boom" }, isFetching: false },
        selected: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "error", message: "boom", isRetrying: false });
  });

  test("defaults selected to the fetched value when untouched", () => {
    expect(
      deriveSectionState({
        canManage: true,
        query: { data: "metadata_only", error: null, isFetching: false },
        selected: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "ready", value: "metadata_only", selected: "metadata_only", isSaving: false, saveError: null });
  });

  test("keeps the user's in-progress selection instead of the fetched value", () => {
    expect(
      deriveSectionState({
        canManage: true,
        query: { data: "full", error: null, isFetching: false },
        selected: "disabled",
        isSaving: true,
        saveError: null
      })
    ).toEqual({ kind: "ready", value: "full", selected: "disabled", isSaving: true, saveError: null });
  });
});

describe("deriveSettingsPageState", () => {
  const READY_LOG_MODE: SectionQueryResult<"full"> = { data: "full", error: null, isFetching: false };
  const READY_LANGUAGE: SectionQueryResult<"ja"> = { data: "ja", error: null, isFetching: false };

  test("returns loading while the permission check itself hasn't resolved yet", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: undefined,
        canManageGuildSettings: undefined,
        logModeQuery: NOT_FETCHED,
        selectedLogMode: null,
        isSavingLogMode: false,
        logModeSaveError: null,
        languageQuery: NOT_FETCHED,
        selectedLanguage: null,
        isSavingLanguage: false,
        languageSaveError: null
      })
    ).toEqual({ kind: "loading" });
  });

  test("returns no-permission only when both capabilities resolve to false", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: false,
        canManageGuildSettings: false,
        logModeQuery: NOT_FETCHED,
        selectedLogMode: null,
        isSavingLogMode: false,
        logModeSaveError: null,
        languageQuery: NOT_FETCHED,
        selectedLanguage: null,
        isSavingLanguage: false,
        languageSaveError: null
      })
    ).toEqual({ kind: "no-permission" });
  });

  test("shows only the log mode section when the caller lacks MANAGE_GUILD_SETTINGS", () => {
    const state = deriveSettingsPageState({
      canManageLoggingSettings: true,
      canManageGuildSettings: false,
      logModeQuery: READY_LOG_MODE,
      selectedLogMode: null,
      isSavingLogMode: false,
      logModeSaveError: null,
      languageQuery: NOT_FETCHED,
      selectedLanguage: null,
      isSavingLanguage: false,
      languageSaveError: null
    });

    expect(state.kind).toBe("loaded");
    expect(state.kind === "loaded" && state.logMode.kind).toBe("ready");
    expect(state.kind === "loaded" && state.language).toEqual({ kind: "hidden" });
  });

  test("shows only the language section when the caller lacks MANAGE_LOGGING_SETTINGS", () => {
    const state = deriveSettingsPageState({
      canManageLoggingSettings: false,
      canManageGuildSettings: true,
      logModeQuery: NOT_FETCHED,
      selectedLogMode: null,
      isSavingLogMode: false,
      logModeSaveError: null,
      languageQuery: READY_LANGUAGE,
      selectedLanguage: null,
      isSavingLanguage: false,
      languageSaveError: null
    });

    expect(state.kind).toBe("loaded");
    expect(state.kind === "loaded" && state.logMode).toEqual({ kind: "hidden" });
    expect(state.kind === "loaded" && state.language.kind).toBe("ready");
  });

  test("shows both sections when the caller holds both capabilities", () => {
    const state = deriveSettingsPageState({
      canManageLoggingSettings: true,
      canManageGuildSettings: true,
      logModeQuery: READY_LOG_MODE,
      selectedLogMode: null,
      isSavingLogMode: false,
      logModeSaveError: null,
      languageQuery: READY_LANGUAGE,
      selectedLanguage: null,
      isSavingLanguage: false,
      languageSaveError: null
    });

    expect(state.kind).toBe("loaded");
    expect(state.kind === "loaded" && state.logMode.kind).toBe("ready");
    expect(state.kind === "loaded" && state.language.kind).toBe("ready");
  });
});

describe("nextSelection", () => {
  test("clears a stale saveError when the user changes the selection instead of retrying save", () => {
    expect(nextSelection("disabled")).toEqual({ selected: "disabled", saveError: null });
  });
});
