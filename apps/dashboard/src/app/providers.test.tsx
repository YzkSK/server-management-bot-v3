import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { trpc } from "../trpc-client";
import { Providers } from "./providers";

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
