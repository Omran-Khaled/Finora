ALTER TABLE "transactions" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "transactions_user_id_idempotency_key_key"
ON "transactions"("user_id", "idempotency_key");
