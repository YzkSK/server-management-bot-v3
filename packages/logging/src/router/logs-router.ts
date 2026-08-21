import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CAP,
  eventNamePrefixesForCategory,
  hasCapability,
  LOG_CATEGORIES
} from "@sm-bot/shared";
import { assertGuildScope, requireCapability, router } from "@sm-bot/dashboard-access";
import {
  getGuildLogMode as getGuildLogModeDefault,
  guildLogModes,
  listLogEvents as listLogEventsDefault,
  setGuildLogMode as setGuildLogModeDefault,
  type DbClient,
  type GuildLogMode,
  type LogEventRow
} from "@sm-bot/db";

const cursorSchema = z.object({
  receivedAt: z.string().datetime(),
  id: z.string().uuid()
});

const listLogsInput = z.object({
  guildId: z.string().min(1),
  category: z.enum(LOG_CATEGORIES),
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50)
});

export interface LogEntryDto {
  id: string;
  eventName: string;
  actorId: string | null;
  channelId: string | null;
  messageId: string | null;
  eventTimestamp: string;
  receivedAt: string;
  payload: Record<string, unknown> | null;
}

export interface ListLogsOutput {
  items: LogEntryDto[];
  nextCursor: { receivedAt: string; id: string } | null;
}

function toLogEntryDto(row: LogEventRow, includePayload: boolean): LogEntryDto {
  return {
    id: row.id,
    eventName: row.eventName,
    actorId: row.actorId,
    channelId: row.channelId,
    messageId: row.messageId,
    eventTimestamp: row.eventTimestamp.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    payload: includePayload ? row.payload : null
  };
}

export interface CreateLogsRouterDeps {
  getDb: () => DbClient;
  listLogEvents?: typeof listLogEventsDefault;
  getGuildLogMode?: typeof getGuildLogModeDefault;
  setGuildLogMode?: typeof setGuildLogModeDefault;
}

export function createLogsRouter(deps: CreateLogsRouterDeps) {
  const listLogEventsImpl = deps.listLogEvents ?? listLogEventsDefault;
  const getGuildLogModeImpl = deps.getGuildLogMode ?? getGuildLogModeDefault;
  const setGuildLogModeImpl = deps.setGuildLogMode ?? setGuildLogModeDefault;

  return router({
    list: requireCapability(CAP.VIEW_LOGS)
      .input(listLogsInput)
      .query(async ({ ctx, input }) => {
        const guildId = assertGuildScope(ctx, input.guildId);

        const canViewRaw = hasCapability(ctx.capabilities, CAP.VIEW_LOGS_RAW);
        const eventNamePrefixes = eventNamePrefixesForCategory(input.category);

        const listInput: Parameters<typeof listLogEventsImpl>[1] = {
          guildId,
          eventNamePrefixes,
          limit: input.limit + 1
        };

        if (input.cursor) {
          listInput.before = {
            receivedAt: new Date(input.cursor.receivedAt),
            id: input.cursor.id
          };
        }

        const rows = await listLogEventsImpl(deps.getDb(), listInput);

        const hasMore = rows.length > input.limit;
        const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
        const lastRow = pageRows[pageRows.length - 1];

        const result: ListLogsOutput = {
          items: pageRows.map((row) => toLogEntryDto(row, canViewRaw)),
          nextCursor:
            hasMore && lastRow
              ? { receivedAt: lastRow.receivedAt.toISOString(), id: lastRow.id }
              : null
        };

        return result;
      }),

    getLogMode: requireCapability(CAP.MANAGE_LOGGING_SETTINGS)
      .input(z.object({ guildId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const guildId = assertGuildScope(ctx, input.guildId);

        const logMode = await getGuildLogModeImpl(deps.getDb(), guildId);
        return { logMode };
      }),

    setLogMode: requireCapability(CAP.MANAGE_LOGGING_SETTINGS)
      .input(z.object({ logMode: z.enum(guildLogModes) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.guildId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "guildId missing after capability check"
          });
        }

        const config = await setGuildLogModeImpl(deps.getDb(), ctx.guildId, input.logMode);
        return { logMode: config.logMode };
      })
  });
}
