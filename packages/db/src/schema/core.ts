import {
  boolean,
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
