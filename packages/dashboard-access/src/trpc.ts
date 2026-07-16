import { initTRPC, TRPCError } from "@trpc/server";

import { hasCapability, type CapabilityBit } from "@sm-bot/shared";

import type { DashboardAccessContext } from "./trpc-context.js";

const t = initTRPC.context<DashboardAccessContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export function requireCapability(cap: CapabilityBit) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!hasCapability(ctx.capabilities, cap)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });
}
