-- Widget clients send an Idempotency-Key on POST /api/widget/issues so a
-- retried report returns the original ticket. NULLs never collide.
ALTER TABLE "tickets" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "tickets_reporter_id_idempotency_key_key" ON "tickets"("reporter_id", "idempotency_key");
