# Prisma schema and migrations

PostgreSQL data layer for the Finora personal-finance platform — the schema, migrations, and commands that back the API's Prisma persistence branch (`ENABLE_PRISMA=true`).

Part of the [Finora monorepo](../README.md).

---

## Entity relationship diagram

Derived directly from [`schema.prisma`](./schema.prisma) (PostgreSQL 16, `prisma-client-js` generator):

```mermaid
erDiagram
    User ||--o{ Account : "owns"
    User ||--o{ Transaction : "owns"
    User ||--o{ Category : "owns (nullable → system categories)"
    User ||--o{ Transfer : "owns"
    User ||--o{ Budget : "owns"
    User ||--o{ SavingsGoal : "owns"
    User ||--o{ Session : "owns"

    Category ||--o{ Transaction : "categorizes (nullable)"
    Category ||--o{ Budget : "scopes"
    Account ||--o{ Transaction : "hosts"
    Account ||--|| SavingsGoal : "funded by (account_id unique)"

    Transaction ||--o| Transfer : "source leg (unique)"
    Transaction ||--o| Transfer : "destination leg (unique)"

    User {
        uuid id PK
        string email UK
        string password_hash
        char(3) base_currency
        timestamp created_at
        timestamp updated_at
    }
    Account {
        uuid id PK
        uuid user_id FK
        string name
        enum AccountType type "CASH | BANK | SAVINGS"
        char(3) currency_code
        bigint opening_balance_minor
        enum AccountStatus status "ACTIVE | ARCHIVED"
    }
    Transaction {
        uuid id PK
        uuid user_id FK
        uuid account_id FK
        uuid category_id FK "nullable"
        enum TransactionType type "INCOME | EXPENSE | TRANSFER"
        bigint amount_minor
        char(3) currency_code
        string description "nullable"
        date transaction_date
        enum TransactionStatus status "ACTIVE | VOIDED"
        enum TransferDirection transfer_direction "SOURCE | DESTINATION, nullable"
        string idempotency_key "nullable"
        string payload_fingerprint "nullable"
    }
    Category {
        uuid id PK
        uuid user_id FK "nullable → system category"
        string name
        enum CategoryType type "INCOME | EXPENSE"
        bool is_system
        enum CategoryStatus status "ACTIVE | ARCHIVED"
    }
    Transfer {
        uuid id PK
        uuid user_id FK
        uuid source_transaction_id FK "unique"
        uuid destination_transaction_id FK "unique"
        string idempotency_key "nullable"
        string payload_fingerprint "nullable"
    }
    Budget {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        smallint year
        smallint month
        bigint limit_minor
    }
    SavingsGoal {
        uuid id PK
        uuid user_id FK
        uuid account_id FK "unique"
        string name
        bigint target_amount_minor
        date target_date "nullable"
        enum GoalStatus status "ACTIVE | COMPLETED | ARCHIVED"
    }
    Session {
        uuid id PK
        uuid user_id FK
        string token_hash UK
        timestamp expires_at
        timestamp revoked_at "nullable"
    }
```


---

## Constraints and indexes

| Table | Constraints | Indexes |
|-------|-------------|---------|
| `users` | `email` UNIQUE | — |
| `accounts` | FK `user_id → users.id` | `(user_id)` |
| `transactions` | FKs `user_id`, `account_id`, `category_id` (nullable) | `(user_id, transaction_date)`, `(account_id, status)`, `(category_id, status, transaction_date)` |
| `categories` | FK `user_id` (nullable — system categories have `NULL`) | `(user_id)` |
| `transfers` | FKs `user_id`, `source_transaction_id` (UNIQUE), `destination_transaction_id` (UNIQUE) | `(user_id)`, UNIQUE `(user_id, idempotency_key)` |
| `budgets` | FKs `user_id`, `category_id` | UNIQUE `(user_id, category_id, year, month)` |
| `savings_goals` | FKs `user_id`, `account_id` (UNIQUE — one goal per account) | `(user_id)`, `(user_id, status)` |
| `sessions` | FK `user_id`, `token_hash` UNIQUE | `(user_id)`, `(user_id, revoked_at)`, `(expires_at)` |

**Enum types:** `AccountType` (CASH/BANK/SAVINGS), `AccountStatus` (ACTIVE/ARCHIVED), `TransactionType` (INCOME/EXPENSE/TRANSFER), `TransactionStatus` (ACTIVE/VOIDED), `CategoryType` (INCOME/EXPENSE), `CategoryStatus` (ACTIVE/ARCHIVED), `GoalStatus` (ACTIVE/COMPLETED/ARCHIVED), `TransferDirection` (SOURCE/DESTINATION).

---

## Migrations (in apply order)

Historical production migrations — **do not modify** (core invariant: never delete or rewrite applied migrations):

| # | Migration | Purpose |
|---|-----------|---------|
| 0001 | `0001_initial` | Core tables: users, accounts, transactions, categories, transfers, budgets, savings_goals, sessions + enums |
| 0002 | `0002_transaction_idempotency` | `idempotency_key` column on transactions (and transfers) |
| 0003 | `0003_make_savings_goal_target_date_nullable` | `target_date` becomes nullable (goal without deadline) |
| 0004 | `0004_transfer_direction` | `transfer_direction` enum column (SOURCE/DESTINATION) on transactions |
| 0005 | `0005_category_type` | `type` + `is_system` + `status` on categories (INCOME/EXPENSE split) |
| 0006 | `0006_idempotency_payload_fingerprint` | `payload_fingerprint` for same-key/different-payload → 409 |
| 0007 | `0007_financial_query_indexes` | Composite indexes for dashboard/transaction queries |
| 0008 | `0008_budget_spending_aggregate_index` | Index supporting budget spending aggregates |

`migration_lock.toml` pins the provider to `postgresql`.

---

## Commands

Run from the repository root (workspace scripts resolve Prisma against this `prisma/` folder):

```bash
pnpm --filter @finora/api db:generate            # Generate Prisma Client after schema changes
pnpm --filter @finora/api db:validate            # Validate schema vs datasource
pnpm --filter @finora/api db:migrate:deploy      # Apply pending migrations (production-safe)
```

Or from `Apps/api/`: `pnpm db:generate`, `pnpm db:validate`, `pnpm db:migrate:deploy`.

**Typical schema-change flow:**
1. Edit `prisma/schema.prisma`
2. Create a migration: `pnpm prisma migrate dev --name <descriptive_name>` (creates the next `NNNN_*` folder)
3. `db:generate` → regenerate the client
4. `db:validate` → confirm schema/datasource coherence (invariant 13)
5. Typecheck + run the test suite (`ENABLE_PRISMA=false` memory mode by default in this checkout)

> **Note:** This checkout's API tests run in memory mode (`ENABLE_PRISMA=false`); the DB-gated and production e2e suites (`test:production`) require a reachable `DATABASE_URL` and apply these migrations first (CI uses a disposable PostgreSQL 16 service).

---

## Data integrity notes

- **Money is `BIGINT` minor units everywhere** — `opening_balance_minor`, `amount_minor`, `limit_minor`, `target_amount_minor` are exact integers; never `DOUBLE PRECISION`
- **Balances are derived, not stored** — `accountBalance` = `opening_balance_minor` ± active non-voided transactions; the DB has no `balance` column to drift
- **Transfer atomicity** — `transfers.source_transaction_id` / `destination_transaction_id` are both UNIQUE, so one transaction row can be the leg of at most one transfer; the API writes both legs + the transfer row in a single Prisma transaction (FI-002: total money unchanged)
- **Idempotency is enforced at two levels** — unique `(user_id, idempotency_key)` on `transfers`; `idempotency_key` + `payload_fingerprint` on `transactions`, letting the service distinguish replay (return cached) from conflict (`409 DUPLICATE_REQUEST`)
- **One budget per user/category/month** — UNIQUE `(user_id, category_id, year, month)` prevents duplicate budgets even under concurrency
- **One savings goal per account** — UNIQUE `account_id` on `savings_goals`
- **Sessions store only `token_hash`** (SHA-256 of the opaque bearer token), with `expires_at` (30-day TTL) and `revoked_at`; revoked/expired sessions cannot authenticate (invariants 8–9)
- **Base currency lock** — `users.base_currency` is set at registration and must remain immutable after account creation (invariants 1–3); `accounts.currency_code` must equal it (checked in the service layer)
- **System categories** use `user_id = NULL` + `is_system = true`, so they are shared but never owned

---

## Related documentation

- [API architecture](../Apps/api/README.md) — persistence branch (`ENABLE_PRISMA`), services that consume this schema
- [Root README](../README.md)

