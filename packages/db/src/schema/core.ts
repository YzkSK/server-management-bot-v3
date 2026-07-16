import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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
    guildId: text("guild_id").notNull(),
    targetType: text("target_type").notNull(),
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
    )
  })
);
