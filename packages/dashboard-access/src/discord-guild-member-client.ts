const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_API_TIMEOUT_MS = 5000;

export class DiscordApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface DiscordGuildMemberAccess {
  roleIds: string[];
  isGuildOwner: boolean;
}

export interface FetchGuildMemberAccessInput {
  botToken: string;
  guildId: string;
  userId: string;
}

interface DiscordGuildMemberResponse {
  roles: string[];
}

interface DiscordGuildResponse {
  owner_id: string;
}

function botAuthHeaders(botToken: string) {
  return { Authorization: `Bot ${botToken}` };
}

// Discord's member endpoint doesn't expose owner status, so the guild is
// fetched in parallel to compare owner_id against the caller.
export async function fetchGuildMemberAccess(
  input: FetchGuildMemberAccessInput
): Promise<DiscordGuildMemberAccess | null> {
  const [memberResponse, guildResponse] = await Promise.all([
    fetch(`${DISCORD_API_BASE_URL}/guilds/${input.guildId}/members/${input.userId}`, {
      headers: botAuthHeaders(input.botToken),
      signal: AbortSignal.timeout(DISCORD_API_TIMEOUT_MS)
    }),
    fetch(`${DISCORD_API_BASE_URL}/guilds/${input.guildId}`, {
      headers: botAuthHeaders(input.botToken),
      signal: AbortSignal.timeout(DISCORD_API_TIMEOUT_MS)
    })
  ]);

  if (memberResponse.status === 404) {
    return null;
  }
  if (!memberResponse.ok) {
    throw new DiscordApiError(
      `Failed to load Discord guild member (${memberResponse.status}).`,
      memberResponse.status
    );
  }
  if (!guildResponse.ok) {
    throw new DiscordApiError(
      `Failed to load Discord guild (${guildResponse.status}).`,
      guildResponse.status
    );
  }

  const member = (await memberResponse.json()) as DiscordGuildMemberResponse;
  const guild = (await guildResponse.json()) as DiscordGuildResponse;

  // Discord's member.roles never includes @everyone (its role id equals the
  // guild id), but dashboard_access_grants stores the everyone baseline as a
  // role-target grant keyed by that id (see ensureEveryoneBaselineGrant).
  return {
    roleIds: [...new Set([input.guildId, ...member.roles])],
    isGuildOwner: guild.owner_id === input.userId
  };
}
