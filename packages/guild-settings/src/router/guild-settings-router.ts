import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { CAP, guildLanguages } from "@sm-bot/shared";
import { assertGuildScope, requireCapability, router } from "@sm-bot/dashboard-access";
import {
  getGuildLanguage as getGuildLanguageDefault,
  setGuildLanguage as setGuildLanguageDefault,
  type DbClient
} from "@sm-bot/db";

export interface CreateGuildSettingsRouterDeps {
  getDb: () => DbClient;
  getGuildLanguage?: typeof getGuildLanguageDefault;
  setGuildLanguage?: typeof setGuildLanguageDefault;
}

export function createGuildSettingsRouter(deps: CreateGuildSettingsRouterDeps) {
  const getGuildLanguageImpl = deps.getGuildLanguage ?? getGuildLanguageDefault;
  const setGuildLanguageImpl = deps.setGuildLanguage ?? setGuildLanguageDefault;

  return router({
    getLanguage: requireCapability(CAP.MANAGE_GUILD_SETTINGS)
      .input(z.object({ guildId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const guildId = assertGuildScope(ctx, input.guildId);

        const language = await getGuildLanguageImpl(deps.getDb(), guildId);
        return { language };
      }),

    setLanguage: requireCapability(CAP.MANAGE_GUILD_SETTINGS)
      .input(z.object({ language: z.enum(guildLanguages) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.guildId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "guildId missing after capability check"
          });
        }

        const config = await setGuildLanguageImpl(deps.getDb(), ctx.guildId, input.language);
        return { language: config.language };
      })
  });
}
