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

export const ALL_CAPABILITIES: bigint = Object.values(CAP).reduce(
  (acc, bit) => acc | bit,
  0n
);

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

export function isKnownCapabilities(value: bigint): boolean {
  return value >= 0n && (value & ~ALL_CAPABILITIES) === 0n;
}

export function canGrantCapabilities(input: CanGrantCapabilitiesInput): boolean {
  if (
    !isKnownCapabilities(input.granterCapabilities) ||
    !isKnownCapabilities(input.requestedCapabilities)
  ) {
    return false;
  }

  if (input.granterIsOwner) return true;

  const isSubsetOfGranter =
    (input.requestedCapabilities & input.granterCapabilities) ===
    input.requestedCapabilities;
  if (!isSubsetOfGranter) return false;

  if (hasCapability(input.requestedCapabilities, CAP.MANAGE_ACCESS)) return false;

  return true;
}

export function capabilitiesToWireString(value: bigint): string {
  if (!isKnownCapabilities(value)) {
    throw new RangeError(`Cannot serialize unknown capabilities: ${value}`);
  }

  return value.toString(10);
}

const WIRE_STRING_PATTERN = /^(?:0|[1-9]\d*)$/;

export function parseCapabilitiesWireString(value: string): bigint {
  if (!WIRE_STRING_PATTERN.test(value)) {
    throw new RangeError(`Invalid capabilities wire string: ${value}`);
  }

  const parsed = BigInt(value);
  if (!isKnownCapabilities(parsed)) {
    throw new RangeError(`Capabilities wire string contains unknown bits: ${value}`);
  }

  return parsed;
}
