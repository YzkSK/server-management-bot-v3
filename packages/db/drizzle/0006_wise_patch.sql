DROP INDEX "logs_stream_synced_at_idx";--> statement-breakpoint
CREATE INDEX "logs_stream_synced_at_idx" ON "logs" USING btree ("received_at") WHERE "logs"."stream_synced_at" IS NULL;