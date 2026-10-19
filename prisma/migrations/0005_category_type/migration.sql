-- Category type is part of the public contract. Existing categories have only
-- ever been used by the current expense-oriented transaction flow.
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

ALTER TABLE "categories"
ADD COLUMN "type" "CategoryType" NOT NULL DEFAULT 'EXPENSE';

ALTER TABLE "categories"
ALTER COLUMN "type" DROP DEFAULT;
