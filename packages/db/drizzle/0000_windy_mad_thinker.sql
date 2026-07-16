CREATE TABLE "dashboard_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"capabilities" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_access_grants_target_type_check" CHECK ("dashboard_access_grants"."target_type" in ('user', 'role'))
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_access_grants_target_idx" ON "dashboard_access_grants" USING btree ("guild_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guilds_guild_id_idx" ON "guilds" USING btree ("guild_id");