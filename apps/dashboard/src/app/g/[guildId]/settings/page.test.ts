import { describe, expect, test } from "bun:test";

import { deriveSettingsPageState, nextLogModeSelection, type LogModeQueryResult } from "./page";

const NOT_FETCHED: LogModeQueryResult = { data: undefined, error: null, isFetching: false };

describe("deriveSettingsPageState", () => {
  test("returns loading while the permission check itself hasn't resolved yet (not no-permission)", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: undefined,
        query: NOT_FETCHED,
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "loading" });
  });

  test("returns no-permission once the permission check has resolved to false", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: false,
        query: NOT_FETCHED,
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "no-permission" });
  });

  test("returns no-permission when the caller lacks MANAGE_LOGGING_SETTINGS, even mid-fetch", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: false,
        query: { data: undefined, error: null, isFetching: true },
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "no-permission" });
  });

  test("returns loading while the initial fetch is in flight (no data, no error)", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: true,
        query: NOT_FETCHED,
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "loading" });
  });

  test("returns error when the initial fetch fails", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: true,
        query: { data: undefined, error: { message: "boom" }, isFetching: false },
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "error", message: "boom", isRetrying: false });
  });

  test("marks the error state as retrying while a refetch is in flight", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: true,
        query: { data: undefined, error: { message: "boom" }, isFetching: true },
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "error", message: "boom", isRetrying: true });
  });

  test("returns an error state (not no-permission) when the permission check itself fails", () => {
    // meQuery.isLoadingはクエリがエラーで終わった場合もfalseになる。
    // それをそのままno-permission判定に使うと、実際は権限確認自体が失敗しているだけなのに
    // 「権限がありません」という誤った表示になってしまう。
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: undefined,
        permissionCheckError: { message: "network error" },
        permissionCheckIsFetching: false,
        query: NOT_FETCHED,
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "error", message: "network error", isRetrying: false });
  });

  test("marks the permission-check error state as retrying while a refetch is in flight", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: undefined,
        permissionCheckError: { message: "network error" },
        permissionCheckIsFetching: true,
        query: NOT_FETCHED,
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({ kind: "error", message: "network error", isRetrying: true });
  });

  test("defaults selectedLogMode to the fetched value when the user hasn't touched the form yet", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: true,
        query: { data: { logMode: "metadata_only" }, error: null, isFetching: false },
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({
      kind: "loaded",
      logMode: "metadata_only",
      selectedLogMode: "metadata_only",
      isSaving: false,
      saveError: null
    });
  });

  test("keeps the user's in-progress selection instead of the fetched value", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: true,
        query: { data: { logMode: "full" }, error: null, isFetching: false },
        selectedLogMode: "disabled",
        isSaving: true,
        saveError: null
      })
    ).toEqual({
      kind: "loaded",
      logMode: "full",
      selectedLogMode: "disabled",
      isSaving: true,
      saveError: null
    });
  });

  test("passes the save error through in the loaded state", () => {
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: true,
        query: { data: { logMode: "full" }, error: null, isFetching: false },
        selectedLogMode: "disabled",
        isSaving: false,
        saveError: "保存に失敗しました。"
      })
    ).toEqual({
      kind: "loaded",
      logMode: "full",
      selectedLogMode: "disabled",
      isSaving: false,
      saveError: "保存に失敗しました。"
    });
  });

  test("reflects the value written directly into the query cache immediately after a save", () => {
    // page.tsxのonSuccessはutils.logs.getLogMode.setData()でクエリキャッシュ自体を
    // 更新するため、以降query.dataは直ちに保存済みの値を返す。バックグラウンドの
    // refetch()が失敗しても、この時点でquery.dataはすでに新しい値になっている。
    expect(
      deriveSettingsPageState({
        canManageLoggingSettings: true,
        query: { data: { logMode: "disabled" }, error: null, isFetching: false },
        selectedLogMode: null,
        isSaving: false,
        saveError: null
      })
    ).toEqual({
      kind: "loaded",
      logMode: "disabled",
      selectedLogMode: "disabled",
      isSaving: false,
      saveError: null
    });
  });

  test("picks up a later genuine server-side change instead of staying pinned to a previously saved value", () => {
    // シナリオ: 直前のテストと同じセッションで、保存によりquery.dataがdisabledになった後、
    // 別の管理者がさらにfullへ変更し、バックグラウンドのrefetchでquery.dataがfullに更新された。
    // deriveSettingsPageStateは保存結果を覚えておく別状態(confirmedLogModeのような
    // シャドー状態)を一切持たず、常にquery.dataをそのまま権威あるソースとして使うため、
    // 新しいfullがそのまま反映されるべき(disabledに固定されたままにならない)。
    const afterSave = deriveSettingsPageState({
      canManageLoggingSettings: true,
      query: { data: { logMode: "disabled" }, error: null, isFetching: false },
      selectedLogMode: null,
      isSaving: false,
      saveError: null
    });
    expect(afterSave.kind === "loaded" && afterSave.logMode).toBe("disabled");

    const afterLaterServerSideChange = deriveSettingsPageState({
      canManageLoggingSettings: true,
      query: { data: { logMode: "full" }, error: null, isFetching: false },
      selectedLogMode: null,
      isSaving: false,
      saveError: null
    });
    expect(afterLaterServerSideChange).toEqual({
      kind: "loaded",
      logMode: "full",
      selectedLogMode: "full",
      isSaving: false,
      saveError: null
    });
  });
});

describe("nextLogModeSelection", () => {
  test("clears a stale saveError when the user changes the selection instead of retrying save", () => {
    // 保存が失敗した後、ユーザーが保存を再試行せずに別の選択肢を選んだ場合、
    // 古い選択に対するsaveErrorが残ったままになると、あたかも新しい選択でも
    // 失敗したかのように誤解を招く表示になってしまう。
    expect(nextLogModeSelection("disabled")).toEqual({
      selectedLogMode: "disabled",
      saveError: null
    });
  });
});
