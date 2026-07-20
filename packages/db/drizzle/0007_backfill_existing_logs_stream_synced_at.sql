-- Custom SQL migration file, put your code below! --
UPDATE "logs" SET "stream_synced_at" = now() WHERE "stream_synced_at" IS NULL;
