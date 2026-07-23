import { DiscordApiError } from "@sm-bot/dashboard-access";

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_API_TIMEOUT_MS = 5000;

export interface DiscordUserGuild {
  id: string;
  name: string;
  owner: boolean;
}

interface DiscordUserGuildResponse {
  id: string;
  name: string;
  owner?: boolean;
}

// リフレッシュは行わない(issue #137のスコープ外)。トークン期限切れは
// 401としてそのままDiscordApiErrorになり、呼び出し側が再ログインを促す。
export async function fetchCurrentUserDiscordGuilds(
  accessToken: string
): Promise<DiscordUserGuild[]> {
  const response = await fetch(`${DISCORD_API_BASE_URL}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(DISCORD_API_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new DiscordApiError(
      `Failed to load the current user's Discord guilds (${response.status}).`,
      response.status
    );
  }

  const guilds = (await response.json()) as DiscordUserGuildResponse[];

  return guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    owner: guild.owner === true
  }));
}
