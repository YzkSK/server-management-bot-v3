import { describe, expect, test } from "bun:test";

import { deriveSettingsPageState, type LogModeQueryResult } from "./page";

const NOT_FETCHED: LogModeQueryResult = { data: undefined, error: null, isFetching: false };

describe("deriveSettingsPageState", () => {
  test("returns no-permission when the caller lacks MANAGE_LOGGING_SETTINGS, even mid-fetch", () => {
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
});
