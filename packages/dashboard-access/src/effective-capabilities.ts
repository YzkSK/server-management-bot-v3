import { CAP, combineCapabilities } from "@sm-bot/shared";

export interface ResolveEffectiveCapabilitiesInput {
  grants: Array<{ capabilities: bigint }>;
  isGuildOwner: boolean;
}

const ALL_CAPABILITIES: bigint = combineCapabilities(...Object.values(CAP));

export function resolveEffectiveCapabilities(
  input: ResolveEffectiveCapabilitiesInput
): bigint {
  if (input.isGuildOwner) return ALL_CAPABILITIES;

  return combineCapabilities(...input.grants.map((grant) => grant.capabilities));
}
