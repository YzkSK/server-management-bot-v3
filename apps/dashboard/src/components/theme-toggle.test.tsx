import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { ThemeProvider } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  test("renders under ThemeProvider without throwing", () => {
    expect(() =>
      renderToString(
        <ThemeProvider attribute="class">
          <ThemeToggle />
        </ThemeProvider>
      )
    ).not.toThrow();
  });
});
