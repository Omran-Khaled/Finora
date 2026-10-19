-- Performance indexes for authoritative financial reads and transfer lookup.
-- No data mutation; safe to apply forward and roll back by dropping these indexes.
CREATE INDEX "transactions_account_id_status_idx"
ON "transactions"("account_id", "status");

CREATE INDEX "transactions_category_id_status_transaction_date_idx"
ON "transactions"("category_id", "status", "transaction_date");

CREATE UNIQUE INDEX "transfers_source_transaction_id_key"
ON "transfers"("source_transaction_id");

CREATE UNIQUE INDEX "transfers_destination_transaction_id_key"
ON "transfers"("destination_transaction_id");

CREATE INDEX "savings_goals_user_id_status_idx"
ON "savings_goals"("user_id", "status");

CREATE INDEX "sessions_user_id_revoked_at_idx"
ON "sessions"("user_id", "revoked_at");

CREATE INDEX "sessions_expires_at_idx"
ON "sessions"("expires_at");
