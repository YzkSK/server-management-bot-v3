import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CAP,
  canGrantCapabilities,
  capabilitiesToWireString,
  parseCapabilitiesWireString
} from "@sm-bot/shared";
import { protectedProcedure, requireCapability, router } from "@sm-bot/dashboard-access";

// Turns a malformed/unknown wire string into a Zod BAD_REQUEST instead of
// letting parseCapabilitiesWireString's RangeError surface as a 500.
const capabilitiesWireInput = z.string().transform((value, ctx) => {
  try {
    return parseCapabilitiesWireString(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "capabilities must be a known decimal capability bitset"
    });
    return z.NEVER;
  }
});

const grantInput = z.object({
  guildId: z.string().min(1),
  targetType: z.enum(["user", "role"]),
  targetId: z.string().min(1),
  capabilities: capabilitiesWireInput
});

export const dashboardAccessRouter = router({
  me: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
    isGuildOwner: ctx.isGuildOwner,
    capabilities: capabilitiesToWireString(ctx.capabilities)
  })),

  grant: requireCapability(CAP.MANAGE_ACCESS)
    .input(grantInput)
    .mutation(({ ctx, input }) => {
      const requested = input.capabilities;

      const allowed = canGrantCapabilities({
        granterCapabilities: ctx.capabilities,
        granterIsOwner: ctx.isGuildOwner,
        requestedCapabilities: requested
      });

      if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Persisting the grant (an upsert into dashboard_access_grants) is done
      // by the first feature-domain issue that wires a real DbClient into
      // the tRPC context — this issue validates the authorization rule only.
      return {
        guildId: input.guildId,
        targetType: input.targetType,
        targetId: input.targetId
      };
    })
});
