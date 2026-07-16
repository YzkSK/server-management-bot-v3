export const CAP = {
  VIEW_LOGS: 1n << 0n,
  VIEW_LOGS_RAW: 1n << 1n,
  VIEW_VOICE: 1n << 2n,
  MANAGE_VOICE: 1n << 3n,
  VIEW_RECRUITMENT: 1n << 4n,
  MANAGE_RECRUITMENT: 1n << 5n,
  VIEW_TTS: 1n << 6n,
  MANAGE_TTS: 1n << 7n,
  MANAGE_LOGGING_SETTINGS: 1n << 8n,
  MANAGE_ACCESS: 1n << 9n,
  MANAGE_GUILD_SETTINGS: 1n << 10n
} as const;

export type CapabilityBit = (typeof CAP)[keyof typeof CAP];

export const BASELINE_EVERYONE_CAPABILITIES: bigint =
  CAP.VIEW_LOGS | CAP.VIEW_VOICE | CAP.VIEW_RECRUITMENT | CAP.VIEW_TTS;

export function hasCapability(capabilities: bigint, cap: bigint): boolean {
  return (capabilities & cap) === cap;
}

export function combineCapabilities(...values: bigint[]): bigint {
  return values.reduce((acc, value) => acc | value, 0n);
}

export interface CanGrantCapabilitiesInput {
  granterCapabilities: bigint;
  granterIsOwner: boolean;
  requestedCapabilities: bigint;
}

export function canGrantCapabilities(input: CanGrantCapabilitiesInput): boolean {
  if (input.granterIsOwner) return true;

  const isSubsetOfGranter =
    (input.requestedCapabilities & input.granterCapabilities) ===
    input.requestedCapabilities;
  if (!isSubsetOfGranter) return false;

  if (hasCapability(input.requestedCapabilities, CAP.MANAGE_ACCESS)) return false;

  return true;
}

export function capabilitiesToWireString(value: bigint): string {
  return value.toString(10);
}

export function parseCapabilitiesWireString(value: string): bigint {
  return BigInt(value);
}
