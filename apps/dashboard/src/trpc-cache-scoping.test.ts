import { describe, expect, test } from "bun:test";
import { getQueryKey } from "@trpc/react-query";

import { trpc } from "./trpc-client";

// react-queryはtRPCのinputをキャッシュキーに含めるため、guildIdをinputに渡すだけで
// ギルドごとに別キャッシュエントリになる。この振る舞い自体を直接検証する
// (#161: 以前はinputにguildIdがなく、別guildへ切替直後に前guildの値が
// キャッシュから一瞬表示されてしまっていた)。
describe("guild-scoped tRPC query keys (#161)", () => {
  test("logs.getLogMode gets a distinct cache key per guildId", () => {
    const keyA = getQueryKey(trpc.logs.getLogMode, { guildId: "guild-a" }, "query");
    const keyB = getQueryKey(trpc.logs.getLogMode, { guildId: "guild-b" }, "query");
    expect(keyA).not.toEqual(keyB);
  });

  test("logs.list gets a distinct cache key per guildId", () => {
    const keyA = getQueryKey(
      trpc.logs.list,
      { guildId: "guild-a", category: "all" },
      "infinite"
    );
    const keyB = getQueryKey(
      trpc.logs.list,
      { guildId: "guild-b", category: "all" },
      "infinite"
    );
    expect(keyA).not.toEqual(keyB);
  });

  test("dashboardAccess.me gets a distinct cache key per guildId, and no guildId when called guild-agnostically", () => {
    const keyA = getQueryKey(trpc.dashboardAccess.me, { guildId: "guild-a" }, "query");
    const keyB = getQueryKey(trpc.dashboardAccess.me, { guildId: "guild-b" }, "query");
    const keyHome = getQueryKey(trpc.dashboardAccess.me, undefined, "query");

    expect(keyA).not.toEqual(keyB);
    expect(keyA).not.toEqual(keyHome);
  });
});
