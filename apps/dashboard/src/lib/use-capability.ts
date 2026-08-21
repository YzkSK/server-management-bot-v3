"use client";

import { useParams } from "next/navigation";

import { hasCapability, parseCapabilitiesWireString, type CapabilityBit } from "@sm-bot/shared";

import { trpc } from "../trpc-client";

export function hasCapabilityFromWireString(
  wireString: string | undefined,
  cap: CapabilityBit
): boolean {
  if (!wireString) {
    return false;
  }

  return hasCapability(parseCapabilitiesWireString(wireString), cap);
}

export function useCapability(cap: CapabilityBit): boolean {
  const { guildId } = useParams<{ guildId: string }>();
  const { data } = trpc.dashboardAccess.me.useQuery({ guildId });
  return hasCapabilityFromWireString(data?.capabilities, cap);
}
