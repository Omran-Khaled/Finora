CREATE INDEX "transactions_user_category_type_status_date_idx"
ON "transactions"("user_id", "category_id", "type", "status", "transaction_date");
