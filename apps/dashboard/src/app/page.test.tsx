import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { Providers } from "./providers";
import HomePage from "./page";

describe("HomePage", () => {
  test("renders under Providers without throwing", () => {
    expect(() =>
      renderToString(
        <Providers>
          <HomePage />
        </Providers>
      )
    ).not.toThrow();
  });
});
