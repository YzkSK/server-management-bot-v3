import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { Providers } from "./providers";
import HomePage, { HomePageView, type HomePageState } from "./page";

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

describe("HomePageView", () => {
  test("renders Loading... while loading", () => {
    const html = renderToString(<HomePageView state={{ kind: "loading" }} />);
    expect(html).toContain("Loading...");
  });

  test("renders a login prompt when unauthorized", () => {
    const html = renderToString(<HomePageView state={{ kind: "unauthorized" }} />);
    expect(html).toContain("Not logged in.");
    expect(html).toContain("Login with Discord");
  });

  test("renders the error message on unexpected errors", () => {
    const html = renderToString(
      <HomePageView state={{ kind: "error", message: "boom" }} />
    );
    expect(html).toContain("Error: <!-- -->boom");
  });

  test("renders userId, guild owner status, and capabilities when authorized", () => {
    const state: HomePageState = {
      kind: "authorized",
      data: { userId: "123", isGuildOwner: false, capabilities: "0" }
    };
    const html = renderToString(<HomePageView state={state} />);
    expect(html).toContain("Logged in as <!-- -->123");
    expect(html).toContain("Guild owner: <!-- -->no");
    expect(html).toContain("Capabilities: <!-- -->0");
  });

  test("renders 'yes' for guild owners", () => {
    const state: HomePageState = {
      kind: "authorized",
      data: { userId: "123", isGuildOwner: true, capabilities: "512" }
    };
    const html = renderToString(<HomePageView state={state} />);
    expect(html).toContain("Guild owner: <!-- -->yes");
  });
});
