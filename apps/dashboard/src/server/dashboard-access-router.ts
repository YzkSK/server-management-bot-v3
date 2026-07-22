import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CAP,
  canGrantCapabilities,
  capabilitiesToWireString,
  parseCapabilitiesWireString
} from "@sm-bot/shared";
import { protectedProcedure, requireCapability, router } from "@sm-bot/dashboard-access";
import { parseDashboardAuthEnv } from "@sm-bot/config";

import { getDashboardDb, getDashboardRedisClient } from "./trpc-context.js";
import { resolveMyGuilds } from "./resolve-my-guilds.js";

const env = parseDashboardAuthEnv();

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

  myGuilds: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.discordAccessToken) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return resolveMyGuilds({
      db: getDashboardDb(),
      cache: await getDashboardRedisClient(),
      botToken: env.DISCORD_BOT_TOKEN,
      userId: ctx.userId!,
      discordAccessToken: ctx.discordAccessToken
    });
  }),

  grant: requireCapability(CAP.MANAGE_ACCESS)
    .input(grantInput)
    .mutation(({ ctx, input }) => {
      if (ctx.guildId !== input.guildId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

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
