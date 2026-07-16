export interface DashboardAccessContext {
  userId: string | null;
  isGuildOwner: boolean;
  capabilities: bigint;
}
