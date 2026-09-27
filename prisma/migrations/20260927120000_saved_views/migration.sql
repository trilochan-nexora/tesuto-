-- Inbox saved views: private per user, optionally shared with the team.
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" TEXT NOT NULL,
    "query" TEXT NOT NULL DEFAULT '',
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "saved_views_owner_id_idx" ON "saved_views"("owner_id");
CREATE INDEX "saved_views_shared_idx" ON "saved_views"("shared");
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
