-- Existing sessions stored bearer tokens in plaintext and did not necessarily
-- expire. Invalidating them is intentional: everyone signs in once through the
-- new verified-email flow and receives a hashed, scoped, expiring session.
DELETE FROM "sessions";

ALTER TABLE "sessions"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'app',
  ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX "sessions_scope_expires_at_idx"
  ON "sessions"("scope", "expires_at");

CREATE TABLE "login_codes" (
  "email" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_sent_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "login_codes_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "login_codes_expires_at_idx" ON "login_codes"("expires_at");
