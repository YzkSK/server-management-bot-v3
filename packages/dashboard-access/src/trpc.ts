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

// guildId必須のprocedureで共通に使う不変条件チェック:
// (1) requireCapability通過後はctx.guildIdが必ず設定されている(念のための防御)
// (2) react-queryのキャッシュキー分離のためinputに含めたguildIdが、
//     ヘッダー由来で権限判定済みのctx.guildIdと一致していること(#161)
// 一致したctx.guildId(non-null)を返す。
export function assertGuildScope(
  ctx: Pick<DashboardAccessContext, "guildId">,
  inputGuildId: string
): string {
  if (!ctx.guildId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "guildId missing after capability check"
    });
  }

  if (inputGuildId !== ctx.guildId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return ctx.guildId;
}
