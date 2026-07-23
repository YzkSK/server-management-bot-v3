import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { GuildShell } from "./guild-shell";

describe("GuildShell", () => {
  test("renders the guild name, a link back to /g, and the nav items", () => {
    const html = renderToString(
      <GuildShell guildId="guild-1" guildName="My Guild">
        <p>child content</p>
      </GuildShell>
    );

    expect(html).toContain("My Guild");
    expect(html).toContain('href="/g"');
    expect(html).toContain('href="/g/guild-1/logs"');
    expect(html).toContain("Logs");
    expect(html).toContain("child content");
  });
});
