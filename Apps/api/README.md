# Finora API

NestJS HTTP API — the **financial authority** for the Finora personal-finance platform. Validates ownership, enforces financial invariants, derives balances from transaction history, and serves versioned endpoints under `/api/v1`.

Part of the [Finora monorepo](../../README.md). Product owner: Omran Khaled — عمران Khalid.

---

## Architectural overview

```mermaid
flowchart TB
    subgraph HTTP["HTTP layer (/api/v1)"]
        CTRL[Controllers<br/>DTO validation<br/>class-validator + forbidNonWhitelisted]
    end

    subgraph Guard["AuthGuard"]
        VALIDATE[Validate bearer token<br/>SHA-256 hash → session → userId<br/>401 if invalid/expired/revoked]
    end

    subgraph SVC["Application services"]
        AUTH[AuthService<br/>register · login · logout · refresh · me]
        ACCT[AccountsService]
        TXN[TransactionsService]
        TRF[TransfersService<br/>atomic two-leg]
        BUD[BudgetsService]
        GOAL[GoalsService]
        DASH[DashboardService]
    end

    subgraph CORE["Core"]
        STORE[InMemoryStore<br/>default persistence]
        MONEY[money.ts<br/>toSafeMinor · fromMinor ·<br/>minorPercentage]
        IDEMP[idempotency.ts<br/>fingerprint ·<br/>Idempotency-Key validation]
        FILTER[api-exception.filter.ts<br/>standardized error envelope]
    end

    subgraph PERSIST["Persistence (runtime branch)"]
        PRISMA[Prisma repositories<br/>ENABLE_PRISMA=true]
        MEM[In-memory branch<br/>ENABLE_PRISMA=false/unset]
    end

    subgraph DB["PostgreSQL 16"]
        DB[(Relational store<br/>prisma/schema.prisma)]
    end

    HTTP --> CTRL
    CTRL --> GUARD
    GUARD --> SVC
    SVC --> CORE
    CORE --> PERSIST
    PERSIST --> DB

    style HTTP fill:#e3f2fd,stroke:#1565c0
    style Guard fill:#fff4e1,stroke:#b26a00
    style SVC fill:#e1f5e1,stroke:#2e7d32
    style CORE fill:#f3e5f5,stroke:#6a1b9a
    style PERSIST fill:#fce4ec,stroke:#880e4f
    style DB fill:#eceff1,stroke:#37474f
```

---

## Endpoints (all under `/api/v1`)

| Domain | Endpoints |
|--------|-----------|
| **Auth** | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me` |
| **Accounts** | `GET/POST /accounts`, `GET/PATCH /accounts/:id`, `POST /accounts/:id/archive` |
| **Categories** | `GET/POST /categories`, `GET/PATCH /categories/:id`, `POST /categories/:id/archive` |
| **Transactions** | `GET/POST /transactions`, `GET/PATCH /transactions/:id`, `POST /transactions/:id/void` |
| **Transfers** | `POST /transfers`, `GET /transfers/:id` |
| **Budgets** | `GET/POST /budgets`, `GET/PATCH /budgets/:id`, `DELETE /budgets/:id` |
| **Savings goals** | `GET/POST /savings-goals`, `GET/PATCH /savings-goals/:id`, `POST /savings-goals/:id/archive` |
| **Dashboard** | `GET /dashboard/summary` |
| **Health** | `GET /health`, `GET /ready` |
| **Docs** | `GET /docs` (Swagger, disabled in production) |

All financial writes require an `Idempotency-Key` header. Responses use standardized envelopes: `{ data }` on success, `{ error: { code, message, requestId } }` on failure.

---
## Execution flows

### Authentication: login → session → refresh

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant C as Client
    participant API as Auth Controller
    participant SVC as AuthService
    participant P as Store / PrismaAuthRepository

    U->>C: Login (email, password)
    C->>API: POST /auth/login
    API->>SVC: login(email, password)
    SVC->>P: Find user by email
    P-->>SVC: user record or null
    alt User not found
        SVC-->>API: 401 UNAUTHORIZED
        API-->>C: { error: { code: 'UNAUTHORIZED' } }
    else User found
        SVC->>SVC: verifyPassword(provided, storedHash)
        alt Password mismatch
            SVC->>SVC: enforceRateLimit('login', subject) → 429 RATE_LIMITED
            SVC-->>API: 401 UNAUTHORIZED
        else Password matches
            SVC->>SVC: issueSession(user) → opaque token, SHA-256 hash, 30-day TTL
            SVC->>P: Persist session
            SVC-->>API: { token, user }
        end
        API-->>C: 200 { data: { token, user } }
        C-->>C: Persist token (SecureStore / sessionStorage)
    end

    note over C,API: Session validation on each request
    C->>API: GET /auth/me + Bearer token
    API->>API: AuthGuard — hash token, lookup session,<br/>check expiry + revocation → userId or 401

    note over C,API: Refresh rotation
    C->>API: POST /auth/refresh + Bearer token
    API->>SVC: refresh(token)
    SVC->>P: Look up session by token hash
    alt Session valid
        SVC->>P: Delete old session (rotation)
        SVC->>SVC: issueSession(user) → new token
        SVC->>P: Persist new session
        SVC-->>API: { token, user }
    else Session invalid
        SVC-->>API: 401 UNAUTHORIZED
    end

    note over C,API: Logout
    C->>API: POST /auth/logout + Bearer token
    API->>SVC: logout(token)
    SVC->>P: Revoke/delete session
    API-->>C: 200 { data: {} }
```

### Atomic transfer between two accounts

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant C as Client
    participant API as TransfersController
    participant SVC as TransfersService
    participant P as Store / Prisma repositories
    participant DB as PostgreSQL

    U->>C: Transfer (fromAccountId, toAccountId, amountMinor, transactionDate)
    C->>API: POST /transfers + Idempotency-Key + Bearer token
    API->>SVC: create(userId, input, idempotencyKey)
    SVC->>SVC: toSafeMinor(amount)
    SVC->>SVC: Compute SHA-256 payload fingerprint
    SVC->>P: Idempotency lookup (key + fingerprint)
    alt Duplicate key, same fingerprint
        SVC-->>API: Return cached result (no mutation)
    else Duplicate key, different fingerprint
        SVC-->>API: 409 DUPLICATE_REQUEST
    else New key
        SVC->>P: Load source + destination accounts (ownership: userId must match)
        alt Not found / not owned
            SVC-->>API: 404 ACCOUNT_NOT_FOUND
        else Both owned
            SVC->>SVC: Reject source.id === destination.id → 422 SAME_ACCOUNT_TRANSFER
            SVC->>SVC: Reject if either ARCHIVED → 422 ACCOUNT_ARCHIVED
            SVC->>SVC: Reject if currencyCode differs → 422 CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED
            SVC->>SVC: Check source balance ≥ amount → 422 INSUFFICIENT_FUNDS
            SVC->>P: Create SOURCE leg (TRANSFER, direction SOURCE)
            SVC->>P: Create DESTINATION leg (TRANSFER, direction DESTINATION)
            alt Prisma mode
                P->>DB: Both legs + Transfer row in single Prisma transaction
            else Memory mode
                P-->>SVC: Single-threaded in-memory inserts
            end
            SVC->>P: Create Transfer record linking both transaction IDs
            SVC-->>API: 201 TransferCreationResult
        end
    end
    API-->>C: { data } or { error }
    C-->>U: Success or error state
```

**Atomicity (implemented):** In Prisma mode, both transfer legs and the transfer record are written inside a single Prisma transaction. In memory mode, the single-threaded in-memory store performs all mutations before returning. Either both legs persist or neither does. FI-002 (transfer does not change total money) is preserved.


---

## Financial algorithms

### Money representation (minor units, bigint)

Money is stored and transmitted as **integer minor units** (e.g. cents for USD), never as floating point.

- **Database:** `BIGINT` columns (`amount_minor`, `opening_balance_minor`, `limit_minor`, `target_amount_minor`)
- **API → client:** serialized as **decimal strings** (`MoneyMinor = string` in contracts) to survive JSON number precision loss
- **Upper bound:** `POSTGRES_BIGINT_MAX = 9223372036854775807n`
- **`toSafeMinor(value)`** rejects non-decimal-integer strings, negative numbers, non-safe-integers, and values exceeding `POSTGRES_BIGINT_MAX` with `422 INVALID_AMOUNT`
- **`fromMinor(bigint)`** returns `value.toString()` — no number coercion

### Account balance calculation

```mermaid
flowchart TD
    Start[accountBalance(accountId)] --> Load[Load account from store]
    Load --> Null{Account exists?}
    Null -- No --> Zero[Return 0n]
    Null -- Yes --> Init[balance = opening_balance_minor]
    Init --> Loop[For each transaction]
    Loop --> Match{accountId matches?}
    Match -- No --> Skip[Skip transaction]
    Match -- Yes --> Void{status == VOIDED?}
    Void -- Yes --> Skip
    Void -- No --> Sign{type == INCOME or<br/>transferDirection == DESTINATION?}
    Sign -- Yes --> Add[balance += amountMinor]
    Sign -- No --> Sub[balance -= amountMinor]
    Add --> Next[Next transaction]
    Sub --> Next
    Skip --> Next
    Next --> More{More transactions?}
    More -- Yes --> Loop
    More -- No --> Result[Return balance]

    style Zero fill:#e1f5e1,stroke:#2e7d32
    style Result fill:#e1f5e1,stroke:#2e7d32
```

**Key points:**
- Voided transactions are skipped (FI-003)
- TRANSFER legs use `transferDirection` to determine sign (SOURCE subtracts, DESTINATION adds)
- INCOME adds, EXPENSE subtracts
- Balance is **derived**, not stored — computed from opening balance + active, non-voided transactions
- In Prisma mode, `balancesForUser(userId)` performs a single aggregated query


### Idempotency: Idempotency-Key + payload fingerprint

```mermaid
flowchart TD
    Start([Financial write request]) --> Key{Idempotency-Key header present?}
    Key -- No --> Bad[400 VALIDATION_ERROR<br/>Idempotency-Key required]
    Key -- Yes --> Len{Key length ≤ 128 chars?}
    Len -- No --> Bad
    Len -- Yes --> Fingerprint[Compute SHA-256 fingerprint<br/>over sorted canonical payload fields]
    Fingerprint --> Exists{Key exists for this user?}
    Exists -- No --> Write[Write new record:<br/>key + fingerprint + result]
    Exists -- Yes --> Match{Stored fingerprint ==<br/>requested fingerprint?}
    Match -- Yes --> Cache[Return cached result<br/>No mutation — idempotent replay]
    Match -- No --> Dup[409 DUPLICATE_REQUEST<br/>Same key, different payload — rejected]
    Write --> Result[(201 Created)]
    Cache --> Result
    Dup --> Result
    Bad --> Result

    style Bad fill:#fdecea,stroke:#c62828
    style Dup fill:#fdecea,stroke:#c62828
    style Result fill:#e1f5e1,stroke:#2e7d32
```

**Where enforced:** `Apps/api/src/core/idempotency.ts` (`fingerprint`, `assertMatchingFingerprint`, `normalizeIdempotencyKey`). Applied in `transactions.service.ts` and `transfers.service.ts`.


### Error handling

```mermaid
flowchart TD
    Req[Request enters NestJS pipeline] --> Val{DTO validation<br/>class-validator, forbidNonWhitelisted}
    Val -- Fail --> E1[422 validation error code]
    Val -- Pass --> Guard{AuthGuard<br/>session valid?}
    Guard -- Fail --> E2[401 UNAUTHORIZED]
    Guard -- Pass --> SVC{Service business rules}
    SVC -- Not found, ownership hides resource --> E3[404 NOT_FOUND<br/>never 403 for enumeration]
    SVC -- Auth failure on known resource --> E4[403 FORBIDDEN]
    SVC -- Business violation --> E5[422 canonical error code]
    SVC -- Rate limit exceeded --> E6[429 RATE_LIMITED]
    SVC -- Duplicate idempotency --> E7[409 DUPLICATE_REQUEST]
    SVC -- Success --> OK[200 / 201 with data]
    E1 --> Env[Standard envelope:<br/>error = code, message, requestId]
    E2 --> Env
    E3 --> Env
    E4 --> Env
    E5 --> Env
    E6 --> Env
    E7 --> Env
    OK --> Env
    Env --> Cli[Client maps code to user-facing message]

    classDef error fill:#fdecea,stroke:#c62828,stroke-width:2px;
    classDef ok fill:#e1f5e1,stroke:#2e7d32,stroke-width:2px;
    class E1,E2,E3,E4,E5,E6,E7 error;
    class OK ok;
```

**Canonical error codes:** `INVALID_AMOUNT`, `INVALID_CURRENCY`, `ACCOUNT_NOT_FOUND`, `ACCOUNT_NOT_OWNED`, `ACCOUNT_ARCHIVED`, `ACCOUNT_HAS_ACTIVE_GOAL`, `CATEGORY_NOT_FOUND`, `INVALID_CATEGORY_TYPE`, `TRANSACTION_NOT_FOUND`, `TRANSACTION_ALREADY_VOIDED`, `INSUFFICIENT_FUNDS`, `SAME_ACCOUNT_TRANSFER`, `CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED`, `BUDGET_ALREADY_EXISTS`, `BUDGET_NOT_FOUND`, `GOAL_NOT_FOUND`, `DUPLICATE_REQUEST`, `BASE_CURRENCY_MISMATCH`, `BASE_CURRENCY_LOCKED`, `RATE_LIMITED`, `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.

---

## Project structure

```
Apps/api/
├── src/
│   ├── app.module.ts        # Module registry
│   ├── main.ts              # Bootstrap: env load, CORS, security headers, Swagger, listen
│   ├── config/
│   │   ├── persistence.ts   # ENABLE_PRISMA resolver (isPrismaPersistenceEnabled)
│   │   └── production.ts    # validateProductionConfiguration()
│   ├── core/
│   │   ├── store.ts                 # InMemoryStore + Prisma repository branches
│   │   ├── money.ts                 # toSafeMinor, fromMinor, minorPercentage
│   │   ├── idempotency.ts           # fingerprint, Idempotency-Key validation
│   │   ├── pagination.ts
│   │   └── api-exception.filter.ts  # Standardized error envelope
│   ├── auth/                # register, login, logout, refresh, me, guard, repository
│   ├── accounts/            # service, controller, dto, module
│   ├── categories/          # service, controller, dto, module
│   ├── transactions/        # service, controller, dto, module
│   ├── transfers/           # service, controller, dto, module
│   ├── budgets/             # service, controller, dto, module
│   ├── goals/               # savings goals service, controller, dto, module
│   ├── dashboard/           # service, controller, dto, module
│   ├── health/              # /health and /ready controllers
│   ├── database/            # PrismaService, repositories (Prisma + in-memory branches)
│   └── swagger/             # setup.ts, schemas.ts (OpenAPI models)
├── test/                    # Jest suites (memory-mode + DB-gated + production e2e)
├── .env                     # Local API environment (ENABLE_PRISMA=true in this checkout)
├── .env.development.example
├── .env.production.example
├── package.json             # @finora/api
├── tsconfig.json
├── nest-cli.json
└── jest.config.js
```

---

## Commands (run from `Apps/api/`)

| Command | Purpose |
|---------|---------|
| `pnpm start` | Start local API (reads `Apps/api/.env`) |
| `pnpm stop` | Stop local API |
| `pnpm start:dev` | Start with `nest start --watch` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm build` | `nest build` |
| `pnpm test` | `jest --runInBand` + local process test |
| `pnpm test:production` | Production e2e (`ENABLE_PRISMA=true`) |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:validate` | Validate Prisma schema |
| `pnpm db:migrate:deploy` | Apply migrations to target DB |

---

## Environment variables

| Variable | Meaning |
|----------|---------|
| `NODE_ENV` | `development` or `production` |
| `PORT` | HTTP listen port (default `5000`) |
| `DATABASE_URL` | PostgreSQL connection string (required in production) |
| `ENABLE_PRISMA` | `true` → Prisma/PostgreSQL; `false`/unset → in-memory |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins |
| `TRUST_PROXY` | `true`/`false` — trust X-Forwarded-For behind proxy |
| `ENABLE_SWAGGER` | Must not be `true` in production |
| `LOG_LEVEL` | Logging level |

**Never commit real credentials.** See `.env.development.example` and `.env.production.example`.

---

## Related documentation

- [Database schema and migrations](../../prisma/README.md)
- [Shared contracts](../../packages/contracts/README.md)
- [Domain Money primitive](../../packages/domain/README.md)
- [Web adapter layer](../Web/README.md)