export interface DashboardAccessContext {
  userId: string | null;
  guildId: string | null;
  isGuildOwner: boolean;
  capabilities: bigint;
}
