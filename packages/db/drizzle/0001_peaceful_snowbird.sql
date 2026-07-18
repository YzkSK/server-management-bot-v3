DELETE FROM "dashboard_access_grants" AS dag
WHERE NOT EXISTS (
  SELECT 1
  FROM "guilds" AS g
  WHERE g."guild_id" = dag."guild_id"
);
--> statement-breakpoint
ALTER TABLE "dashboard_access_grants" ADD CONSTRAINT "dashboard_access_grants_guild_id_guilds_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("guild_id") ON DELETE cascade ON UPDATE no action;