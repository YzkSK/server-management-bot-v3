import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "bun:test";

import { getLocale } from "@sm-bot/shared";

import { GuildShellView } from "./guild-shell";

const locale = getLocale("ja");

describe("GuildShellView", () => {
  test("renders the guild name trigger, nav items, and children", () => {
    render(
      <GuildShellView guildId="guild-1" guildName="My Guild" locale={locale}>
        <p>child content</p>
      </GuildShellView>
    );

    expect(screen.getByRole("button", { name: /My Guild/ })).toBeDefined();
    expect(screen.getByRole("link", { name: "Logs" }).getAttribute("href")).toBe(
      "/g/guild-1/logs"
    );
    expect(screen.getByText("child content")).toBeDefined();
  });

  test("opens the guild menu with links to settings and server switching", async () => {
    const user = userEvent.setup();
    render(
      <GuildShellView guildId="guild-1" guildName="My Guild" locale={locale}>
        <p>child content</p>
      </GuildShellView>
    );

    await user.click(screen.getByRole("button", { name: /My Guild/ }));

    const settingsItem = screen.getByRole("menuitem", { name: "サーバー設定" });
    expect(settingsItem.getAttribute("data-disabled")).toBeNull();
    expect(settingsItem.getAttribute("href")).toBe("/g/guild-1/settings");

    const switchItem = screen.getByRole("menuitem", { name: "サーバーを切り替える" });
    expect(switchItem.getAttribute("href")).toBe("/g");
  });

  test("renders English labels when given the English locale", async () => {
    const user = userEvent.setup();
    render(
      <GuildShellView guildId="guild-1" guildName="My Guild" locale={getLocale("en")}>
        <p>child content</p>
      </GuildShellView>
    );

    await user.click(screen.getByRole("button", { name: /My Guild/ }));

    expect(screen.getByRole("menuitem", { name: "Server settings" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Switch server" })).toBeDefined();
  });
});
