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

  test("reflects the value written directly into the query cache immediately after a save", () => {
    // page.tsxのonSuccessはutils.X.setData()でクエリキャッシュ自体を更新するため、
    // 以降query.dataは直ちに保存済みの値を返す。バックグラウンドのrefetch()が
    // 失敗しても、この時点でquery.dataはすでに新しい値になっている。
    expect(
      deriveSectionState({
        canManage: true,
        query: { data: "disabled", error: null, isFetching: false },
        selected: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "ready", value: "disabled", selected: "disabled", isSaving: false, saveError: null });
  });

  test("picks up a later genuine server-side change instead of staying pinned to a previously saved value", () => {
    // シナリオ: 直前のテストと同じセッションで、保存によりquery.dataがdisabledになった後、
    // 別の管理者がさらにfullへ変更し、バックグラウンドのrefetchでquery.dataがfullに更新された。
    // deriveSectionStateは保存結果を覚えておく別状態(シャドー状態)を一切持たず、常に
    // query.dataをそのまま権威あるソースとして使うため、新しいfullがそのまま
    // 反映されるべき(disabledに固定されたままにならない)。
    const afterSave = deriveSectionState({
      canManage: true,
      query: { data: "disabled", error: null, isFetching: false },
      selected: null,
      isSaving: false,
      saveError: null
    });
    expect(afterSave.kind === "ready" && afterSave.value).toBe("disabled");

    const afterLaterServerSideChange = deriveSectionState({
      canManage: true,
      query: { data: "full", error: null, isFetching: false },
      selected: null,
      isSaving: false,
      saveError: null
    });
    expect(afterLaterServerSideChange).toEqual({
      kind: "ready",
      value: "full",
      selected: "full",
      isSaving: false,
      saveError: null
    });
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

  test("returns an error state (not no-permission) when the permission check itself fails", () => {
    // meQuery.isLoadingはクエリがエラーで終わった場合もfalseになる。
    // それをそのままno-permission判定に使うと、実際は権限確認自体が失敗しているだけなのに
    // 「権限がありません」という誤った表示になってしまう。
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: undefined,
        canManageGuildSettings: undefined,
        permissionCheckError: { message: "network error" },
        permissionCheckIsFetching: false,
        logModeQuery: NOT_FETCHED,
        selectedLogMode: null,
        isSavingLogMode: false,
        logModeSaveError: null,
        languageQuery: NOT_FETCHED,
        selectedLanguage: null,
        isSavingLanguage: false,
        languageSaveError: null
      })
    ).toEqual({ kind: "error", message: "network error", isRetrying: false });
  });

  test("marks the permission-check error state as retrying while a refetch is in flight", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: undefined,
        canManageGuildSettings: undefined,
        permissionCheckError: { message: "network error" },
        permissionCheckIsFetching: true,
        logModeQuery: NOT_FETCHED,
        selectedLogMode: null,
        isSavingLogMode: false,
        logModeSaveError: null,
        languageQuery: NOT_FETCHED,
        selectedLanguage: null,
        isSavingLanguage: false,
        languageSaveError: null
      })
    ).toEqual({ kind: "error", message: "network error", isRetrying: true });
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
