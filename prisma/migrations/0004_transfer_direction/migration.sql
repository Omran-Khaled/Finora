-- CreateEnum
CREATE TYPE "TransferDirection" AS ENUM ('SOURCE', 'DESTINATION');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "transfer_direction" "TransferDirection";

-- Backfill existing transfer legs from the "transfers" table
UPDATE "transactions"
SET "transfer_direction" = 'SOURCE'
WHERE "id" IN (SELECT "source_transaction_id" FROM "transfers");

UPDATE "transactions"
SET "transfer_direction" = 'DESTINATION'
WHERE "id" IN (SELECT "destination_transaction_id" FROM "transfers");
