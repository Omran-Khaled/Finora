-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'SAVINGS');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "opening_balance_minor" BIGINT NOT NULL,
    "status" "AccountStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID,
    "type" "TransactionType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "description" TEXT,
    "transaction_date" DATE NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL,
    "status" "CategoryStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_transaction_id" UUID NOT NULL,
    "destination_transaction_id" UUID NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "limit_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount_minor" BIGINT NOT NULL,
    "target_date" DATE NOT NULL,
    "status" "GoalStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_transaction_date_idx" ON "transactions"("user_id", "transaction_date");

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");

-- CreateIndex
CREATE INDEX "transfers_user_id_idx" ON "transfers"("user_id");

CREATE UNIQUE INDEX "transfers_user_id_idempotency_key_key" ON "transfers"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_year_month_key" ON "budgets"("user_id", "category_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "savings_goals_account_id_key" ON "savings_goals"("account_id");

-- CreateIndex
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add ownership and aggregate integrity constraints.
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_source_transaction_id_fkey" FOREIGN KEY ("source_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_transaction_id_fkey" FOREIGN KEY ("destination_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_opening_balance_nonnegative" CHECK ("opening_balance_minor" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_month_valid" CHECK ("month" BETWEEN 1 AND 12);
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_limit_nonnegative" CHECK ("limit_minor" >= 0);
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_target_positive" CHECK ("target_amount_minor" > 0);
