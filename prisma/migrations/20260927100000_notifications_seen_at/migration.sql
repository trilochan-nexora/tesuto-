-- Per-user read marker for the in-app notification feed.
ALTER TABLE "users" ADD COLUMN "notifications_seen_at" TIMESTAMP(3);
