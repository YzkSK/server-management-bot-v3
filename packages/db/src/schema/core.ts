import { ALL_CAPABILITIES } from "@sm-bot/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const guilds = pgTable(
  "guilds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    guildIdIdx: uniqueIndex("guilds_guild_id_idx").on(table.guildId)
  })
);

export const dashboardAccessGrants = pgTable(
  "dashboard_access_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.guildId, { onDelete: "cascade" }),
    targetType: text("target_type").notNull().$type<"user" | "role">(),
    targetId: text("target_id").notNull(),
    capabilities: bigint("capabilities", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date())
  },
  (table) => ({
    targetIdx: uniqueIndex("dashboard_access_grants_target_idx").on(
      table.guildId,
      table.targetType,
      table.targetId
    ),
    targetTypeCheck: check(
      "dashboard_access_grants_target_type_check",
      sql`${table.targetType} in ('user', 'role')`
    ),
    // capabilitiesビットを追加/削除したら ALL_CAPABILITIES (packages/shared/src/capabilities.ts) の値が変わるため、
    // `pnpm db:generate` でマイグレーションを再生成すること。
    capabilitiesRangeCheck: check(
      "dashboard_access_grants_capabilities_check",
      sql`${table.capabilities} >= 0 and (${table.capabilities} | ${sql.raw(ALL_CAPABILITIES.toString())}) = ${sql.raw(ALL_CAPABILITIES.toString())}`
    )
  })
);

export const guildLogModes = ["full", "metadata_only", "disabled"] as const;

export type GuildLogMode = (typeof guildLogModes)[number];

export const guildConfigs = pgTable(
  "guild_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.guildId, { onDelete: "cascade" }),
    logMode: text("log_mode").$type<GuildLogMode>().notNull().default("full"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date())
  },
  (table) => ({
    guildIdIdx: uniqueIndex("guild_configs_guild_id_idx").on(table.guildId),
    logModeCheck: check(
      "guild_configs_log_mode_check",
      sql`${table.logMode} in ('full', 'metadata_only', 'disabled')`
    )
  })
);

export const logs = pgTable(
  "logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventName: text("event_name").notNull(),
    guildId: text("guild_id").references(() => guilds.guildId, {
      onDelete: "cascade"
    }),
    actorId: text("actor_id"),
    channelId: text("channel_id"),
    messageId: text("message_id"),
    eventTimestamp: timestamp("event_timestamp", {
      withTimezone: true
    }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    realtimeEnabled: boolean("realtime_enabled").notNull().default(false),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    // stream書き込みが未完了/失敗のレコードを示すoutboxマーカー。
    // null = 未同期。backfillUnsyncedLogEventsがこのカラムを使って再送対象を検出する(issue #103)。
    streamSyncedAt: timestamp("stream_synced_at", { withTimezone: true })
  },
  (table) => ({
    eventNameIdx: index("logs_event_name_idx").on(table.eventName),
    guildIdIdx: index("logs_guild_id_idx").on(table.guildId),
    actorIdIdx: index("logs_actor_id_idx").on(table.actorId),
    channelIdIdx: index("logs_channel_id_idx").on(table.channelId),
    receivedAtIdx: index("logs_received_at_idx").on(table.receivedAt),
    guildReceivedAtIdx: index("logs_guild_received_at_idx").on(
      table.guildId,
      table.receivedAt
    ),
    // 未同期(streamSyncedAt IS NULL)の行だけを対象にした部分index。
    // ほぼ全行が最終的にsync済みになるため、全件対象のindexだと肥大化し続ける(issue #103レビュー指摘)。
    streamSyncedAtIdx: index("logs_stream_synced_at_idx")
      .on(table.receivedAt)
      .where(sql`${table.streamSyncedAt} IS NULL`)
  })
);
