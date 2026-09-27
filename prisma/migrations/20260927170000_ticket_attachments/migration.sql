-- Private file and voice-note metadata. Binary payloads continue to live in
-- MEDIA_STORAGE_DIR and are tracked by media_objects.
ALTER TABLE "tickets" ADD COLUMN "attachments" JSONB;
ALTER TABLE "comments" ADD COLUMN "attachments" JSONB;
