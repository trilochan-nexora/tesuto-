-- CreateTable
CREATE TABLE "widget_links" (
    "host_email" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT,
    "code_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "widget_links_pkey" PRIMARY KEY ("host_email")
);

-- AddForeignKey
ALTER TABLE "widget_links" ADD CONSTRAINT "widget_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
