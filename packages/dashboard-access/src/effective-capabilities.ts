import { ALL_CAPABILITIES, combineCapabilities } from "@sm-bot/shared";

export interface ResolveEffectiveCapabilitiesInput {
  grants: Array<{ capabilities: bigint }>;
  isGuildOwner: boolean;
}

export function resolveEffectiveCapabilities(
  input: ResolveEffectiveCapabilitiesInput
): bigint {
  if (input.isGuildOwner) return ALL_CAPABILITIES;

  return combineCapabilities(...input.grants.map((grant) => grant.capabilities));
}
