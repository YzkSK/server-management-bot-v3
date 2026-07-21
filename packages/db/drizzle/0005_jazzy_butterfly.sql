ALTER TABLE "logs" ADD COLUMN "stream_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "logs_stream_synced_at_idx" ON "logs" USING btree ("stream_synced_at");