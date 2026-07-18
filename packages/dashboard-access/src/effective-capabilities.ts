import { ALL_CAPABILITIES, combineCapabilities, isKnownCapabilities } from "@sm-bot/shared";

export interface ResolveEffectiveCapabilitiesInput {
  grants: Array<{ capabilities: bigint }>;
  isGuildOwner: boolean;
}

export function resolveEffectiveCapabilities(
  input: ResolveEffectiveCapabilitiesInput
): bigint {
  for (const grant of input.grants) {
    if (!isKnownCapabilities(grant.capabilities)) {
      throw new RangeError(
        `Grant contains unknown capabilities bits: ${grant.capabilities}`
      );
    }
  }

  if (input.isGuildOwner) return ALL_CAPABILITIES;

  return combineCapabilities(...input.grants.map((grant) => grant.capabilities));
}
