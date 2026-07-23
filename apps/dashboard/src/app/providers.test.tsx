import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { trpc } from "../trpc-client";
import { guildIdFromPathname, Providers } from "./providers";

function Probe() {
  trpc.dashboardAccess.me.useQuery(undefined, { retry: false });
  return null;
}

describe("Providers", () => {
  test("renders children under trpc.Provider and QueryClientProvider without throwing", () => {
    expect(() =>
      renderToString(
        <Providers>
          <Probe />
        </Providers>
      )
    ).not.toThrow();
  });
});

describe("guildIdFromPathname", () => {
  test("extracts the guildId from a /g/<guildId> path", () => {
    expect(guildIdFromPathname("/g/guild-1")).toBe("guild-1");
  });

  test("extracts the guildId from a nested /g/<guildId>/... path", () => {
    expect(guildIdFromPathname("/g/guild-1/logs")).toBe("guild-1");
  });

  test("returns null for paths outside /g", () => {
    expect(guildIdFromPathname("/g")).toBeNull();
    expect(guildIdFromPathname("/")).toBeNull();
    expect(guildIdFromPathname("/settings")).toBeNull();
  });
});
