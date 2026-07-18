CREATE TABLE "logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"guild_id" text,
	"actor_id" text,
	"channel_id" text,
	"message_id" text,
	"event_timestamp" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"realtime_enabled" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_guild_id_guilds_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("guild_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logs_event_name_idx" ON "logs" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "logs_guild_id_idx" ON "logs" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "logs_actor_id_idx" ON "logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "logs_channel_id_idx" ON "logs" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "logs_received_at_idx" ON "logs" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "logs_guild_received_at_idx" ON "logs" USING btree ("guild_id","received_at");