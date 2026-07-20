CREATE TABLE "guild_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"log_mode" text DEFAULT 'full' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_configs_log_mode_check" CHECK ("guild_configs"."log_mode" in ('full', 'metadata_only', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "guild_configs" ADD CONSTRAINT "guild_configs_guild_id_guilds_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("guild_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guild_configs_guild_id_idx" ON "guild_configs" USING btree ("guild_id");