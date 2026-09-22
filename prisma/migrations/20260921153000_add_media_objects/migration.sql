CREATE TABLE "media_objects" (
  "id" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_objects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_objects_storage_key_key"
  ON "media_objects"("storage_key");
CREATE INDEX "media_objects_ticket_id_idx"
  ON "media_objects"("ticket_id");

ALTER TABLE "media_objects"
  ADD CONSTRAINT "media_objects_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
