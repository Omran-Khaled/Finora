# Finora Project Technical Audit

**Audit date:** 2026-10-15  
**Auditor:** Principal Software Architect + Senior Code Auditor (manual, read-only code review)  
**Scope:** `Apps/api`, `Apps/Web`, `Apps/Mobile`, `packages/contracts`, `packages/domain`, `prisma`, `docs`, `scripts`, `tests`  
**Environment:** Windows 11, PowerShell, Node runtime inspection only (no registry access, no live DB)

---

## 0. Executive Summary

### 0.1 State of the project

Finora is a monorepo for a personal-finance mobile + web application. The architecture is well-defined and largely coherent:

- **Apps/Mobile** — Expo Router / React Native 0.86.3 app (Expo SDK 57)
- **Apps/Web** — Next.js 16.4.0 (App Router) with Radix UI
- **Apps/api** — NestJS 10.x modular monolith (the financial authority)
- **packages/contracts** — shared TypeScript type contract (single source of truth for resource shapes and field manifests)
- **packages/domain** — pure financial primitives (`Money` with integer `bigint` minor units)
- **prisma/** — PostgreSQL + Prisma schema + 8 migrations

The project is currently in a **HARDENED RELEASE CANDIDATE — NOT YET CERTIFIED PRODUCTION GO** state. The project's own release document states that runtime gates (clean `pnpm install`, Prisma client generation, live DB concurrency smoke test, real Web/Mobile → API smoke) **could not be executed** in this audit environment because the sandbox has no registry access and no live PostgreSQL. Those gates remain open.

### 0.2 Most critical risks
### 0.3 Strengths

- **Architecture is intentionally layered and dependency-inverted** — `packages/domain` has no NestJS/Prisma/HTTP dependency; the dependency rule "Presentation → Application → Domain → Infrastructure" is documented and largely followed.
- **Integer minor-unit money model** — all financial amounts use `bigint` (minor units), avoiding floating-point drift across DB→API→client. Contracts represent money as decimal strings.
- **Idempotency design is thoughtfully implemented** — payload fingerprint, deterministic rejection of same key + different payload, `FOR UPDATE` locks on transfer legs, and idempotent transfers via `(userId, idempotencyKey)` unique index.
- **Strong contract-governance machinery** — `packages/contracts` owns canonical shapes + field manifests, asserted against OpenAPI models, DTOs, runtime responses, Web mock, and Mobile mock by static-scan and runtime e2e tests.
- **Explicit authorization rules** — 404 for cross-user resource access; `FOR UPDATE` optimistic locking on sensitive mutations; revocation with rotation integrity.
- **Well-tested at multiple levels** — API jest suite (19 suites / 136 tests), Web vitest (58 tests), Mobile jest (58 tests), plus contract-drift and financial-scenario suites.
- **No secrets committed** — `.env` files are gitignored; production example files show placeholders only.

### 0.4 Weaknesses

- The live *data* path is currently an in-memory store by default, so the Prisma repositories are not wired into every module (see issue §1.2).
- The project is not "connected end-to-end" — Web and Mobile connect via mock server unless explicit env flags are set.

### 1. Project Map

### 1.1 Repository layout

```
finora/
├── .agent/                 # Agent prompts and internal rules
├── .github/workflows/ci.yml   # CI pipeline (pnpm, Postgres service, e2e)
├── .vscode/                # Editor settings
├── Apps/
│   ├── api/                # NestJS 10.x backend (financial authority)
│   ├── Mobile/             # Expo Router / React Native 0.86.3
│   └── Web/                # Next.js 16.4.0 (App Router)
├── packages/
│   ├── contracts/          # Shared API contract (types + field manifests)
│   └── domain/             # Pure financial primitives (Money)
├── prisma/
│   ├── schema.prisma       # PostgreSQL schema (8 enums, 8 models)
│   └── migrations/         # 0001_initial … 0008_budget_spending_aggregate_index
├── docs/                   # Architecture, ADRs, business rules, contracts, ops
├── scripts/                # Backup/restore (ps1), local dev starters
└── tests/
    └── fixtures/
        └── financial-scenarios/   # 6 JSON golden scenarios
```

### 1.2 Technology stack

| Layer | Technology | Version |
|---|---|---|
| Package manager | pnpm | 12.7.0 (enforced via `packageManager`) |
| Runtime engine | Node.js | `>=22.16.0 <23` |
| Backend API | NestJS 10.x (modular monolith) | 10.4.22 |
| Database | PostgreSQL 16 (containerized in CI) | via Prisma 6.19.3 |
| ORM | Prisma | 6.19.3 |
| Web frontend | Next.js 16.4.0 (App Router) + Radix UI + Tailwind | 16.4.0 / 3.3.3 |
| Mobile frontend | Expo Router + React Native 0.86.3 | Expo SDK 57 |

### 1.3 Architecture (intent vs. current state)

**Documented intent** (`docs/project-lifecycle.md`): Web/Mobile = clients; API = Financial Authority; Contracts = agreement; Domain = pure rules; Database = durable persistence. Web/Mobile default to **Mock Adapter** unless explicitly switched to **Real Adapter**.

**Current state** (verified by code review):

- The API module graph is: `AuthModule`, `AccountsModule`, `CategoriesModule`, `TransactionsModule`, `TransfersModule`, `BudgetsModule`, `GoalsModule`, `DashboardModule`, each with a controller + service. `DatabaseModule` wires the Prisma services and repositories.
- Every service is built around a `InMemoryStore` that is the **default** data sink. When `ENABLE_PRISMA=true`, the service routes writes (and sometimes reads) through a parallel set of `Prisma…Repository` classes.
- `packages/contracts` is the **only** place where Web and Mobile receive the canonical types; the Mobile app re-exports them via `apps/Mobile/types/contract.ts`, and the Web app re-exports them via `apps/Web/lib/types.ts`.
- The Web resolves `NEXT_PUBLIC_API_BASE_URL` from an env var; Mobile uses `EXPO_PUBLIC_API_URL` + `EXPO_PUBLIC_USE_REAL_API=1`.
- The architecture is therefore **layered and contract-driven by design**, but the **runtime wiring is only complete in the explicit "production mode" path**, which is not what happens on a plain `pnpm start`.

### 1.4 End-to-end request flow (transfer creation)

1. Mobile/Web sends `POST /transfers` with a JSON body and an `Idempotency-Key` header.
2. `AuthGuard` verifies the opaque bearer token against the `InMemoryStore` **and/or** the persisted `sessions` table, depending on `ENABLE_PRISMA`.
3. `TransfersService.create()`:
   - generates `payloadFingerprint` = SHA-256 of the canonicalized payload;
   - checks the in-memory transfer-by-idempotency map (dev mode) or the Prisma `transfers` table (prod mode);
   - same key + different fingerprint → `409 DUPLICATE_REQUEST`;
   - same key + same fingerprint → returns the original transfer unchanged;
   - otherwise it locks source + destination accounts (`FOR UPDATE`), checks archived status, cross-currency, same-account, and sufficient funds;
   - inside a Prisma transaction it:
| C-07 | Confirmed | **Session store mixes in-memory and persisted sessions in `AuthGuard`** | `Apps/api/src/auth/auth.guard.ts` | `AuthGuard.canActivate` reads `this.store.sessions` (in-memory) when `ENABLE_PRISMA !== "true"`, and `this.persistent.findSession` (Prisma `sessions` table) when `ENABLE_PRISMA === "true"`. In the Prisma path it **also** writes the session back into `store.sessions` on each request. | The guard is built on the same dual-store assumption as the rest of the API. | A revoked or expired session can persist in the in-memory store (when Prisma is disabled), or the in-memory cache can go stale and bypass revocation when Prisma is enabled. | With Prisma on, revoke a session in DB; refresh the client; the guard reads from `sessions` table → returns 401. With Prisma off, revoke the store's session object → 401. The two modes behave differently, which is a source of inconsistency. |

### 2.1 Confirmed issues
| C-08 | Confirmed | **No explicit `userId` authorization wrapper on financial writes** | `Apps/api/src/accounts/accounts.service.ts`, `transactions/transactions.service.ts`, `transfers/transfers.service.ts`, `budgets/budgets.service.ts`, `goals/goals.service.ts` | These services take `userId` but do not enforce ownership via a single `currentUser()` helper. Ownership checks (`account.userId !== userId`) are scattered inside each service and inside controller DTOs. | Architectural: ownership is decentralized instead of delegated to a reusable guard/service. | A logical bug in one ownership check can silently allow cross-user access (or return `404` instead of `403`). Consistent 404-vs-403 is documented but not enforced by a common path. | Audit every service for the pattern `if (target.userId !== userId) throw`. The pattern exists in `AccountsService.owned`, `TransactionsService.owned`, `CategoriesService.owned`, `GoalsService.owned`, `BudgetsService.owned`. Each location must be reviewed for the documented "404 for privacy" rule. |
| C-09 | Confirmed | **SQL string interpolation in Prisma repositories** | `Apps/api/src/database/repositories/prisma-*.repository.ts` | Files build SQL by interpolating `userId::uuid` and `id::uuid` into `$queryRaw` templates, e.g. `WHERE id = ${accountId}::uuid`. | No sanitization layer; the values are UUIDs in practice, so injection risk is low, but the practice is unsafe and vulnerable to future refactoring. | A later refactor that passes non-UUID strings would create an SQL injection vector. Also `Prisma.sql` is used inconsistently with template strings. | Replace all `::uuid` casts with `Prisma.getTableName()`-based parameterization, or use `Prisma.sql` consistently with proper escaping. The tests should include a negative SQL-injection case. |
| C-10 | Confirmed | **No explicit permission/auditing for admin or internal endpoints** | `Apps/api/src/core/core.module.ts`, `Apps/api/src/config/production.ts` | There is a `CoreModule` that wires `InMemoryStore` + `PrismaAuthRepository`; the config module validates production config but does not define role-based access control. | MVP scope has a single-tenant "user" model; no admin roles were implemented. | As soon as roles/orgs are added, the auth layer will need a rewrite. The MVP scope does not currently require it. | Review the `AuthGuard` and `PrismaAuthRepository` for role support; plan for RBAC if multi-tenant ops are added. |

**Note on C-05 and C-06**: C-05 turned out to be a false positive on audit date. C-06 flagged as a structural observation, not a bug.


### 2.2 Potential issues

| # | Classification | Title | Location | Evidence | Risk | Verification |
|---|---|---|---|---|---|---|
| P-01 | Potential | **`InMemoryStore` is the default and loses data on restart** | `Apps/api/src/core/store.ts` | The store is an `@Injectable()` with `Map`s; the API starts without DB and reads/writes memory. This is intentional for "development adapter" per docs, but every module must rely on the env switch being set correctly before any data is loaded. | No data persistence in dev by default; CI (`test:production`) sets `ENABLE_PRISMA=true` and runs real tests against a DB, but the default CI matrix still includes a Prisma-less suite. | Run `start:dev` without `ENABLE_PRISMA` and confirm that a transaction is removed after restart. |
| P-02 | Potential | **Idempotency key length limit is 128 chars and is only enforced in the API** | `Apps/api/src/core/idempotency.ts` | `MAX_IDEMPOTENCY_KEY_LENGTH = 128`; `normalizeIdempotencyKey` rejects longer keys with `400 VALIDATION_ERROR`. The Web/Mobile HTTP adapters forward the header without trimming/upper-casing. | A client sending a longer key gets a 400; two different clients might disagree on normalization, causing inconsistent acceptance. | Send a header longer than 128 chars and confirm 400. Confirm the same key with different payloads is 409. |
| P-03 | Potential | **`accountBalance()` computes a running balance over all transactions, which is O(n) per request** | `Apps/api/src/core/store.ts` | `accountBalance` iterates all transactions in memory for each account. In a large user base this is expensive. | Performance degradation at high transaction volume. | Add a benchmark with 100k transactions and measure the `GET /accounts` response time. |
| P-04 | Potential | **No request-rate limiting at the HTTP boundary** | `Apps/api/src/auth/auth.service.ts` | `AuthService` tracks per-subject rate limits in memory, but there is no global rate limiter on other endpoints. | An attacker could brute-force financial endpoints. | Run a load test sending 1000 requests/s to `/accounts` and confirm no rate limiting. |
| P-05 | Potential | **No audit logging for financial mutations** | All services | Mutations (create/update/archive/void) are not logged anywhere (no structured audit log). | Compliance/forensics in case of disputes or fraud. | Add an `audit.log` table or equivalent and verify every financial mutation writes a log entry. |
| P-06 | Potential | **No monitoring/metrics/alerting** | All services | The app has no `/metrics` endpoint and logs only to console. | Operational blind spots. | Add Prometheus `/metrics` endpoint and alert rules for error rate, latency, and DB connection pool exhaustion. |
| P-07 | Potential | **Prisma client generation is not part of the clean build** | `packages/api/package.json` | `db:generate` is a script; the CI runs it, but the `build` script (`nest build`) does not depend on it. | If `dist/` is checked in or regenerated differently, the app may run against a stale Prisma client. | Verify that `db:generate` is a hard dependency of `build`, and that CI always runs `db:generate` before `build`. |
| P-08 | Potential | **No per-endpoint retry policy for transient DB failures** | `Apps/api/src/core/api-exception.filter.ts` | The filter maps `P1001`/`P1002` to `503`, but there is no client-side retry. | Transient failures return 503 and the client must implement retry semantics. | Add a retry header to the client and test 503 retry behavior. |

     - creates `source` and `destination` `TRANSFER` transactions (positive amounts; debit/credit via directions),
     - creates a `transfers` row linking their IDs,
     - returns the envelope `{ transfer, sourceTx, destinationTx }`.
4. The response is rendered by the client; balances are computed on read via `accountBalance()` (in-memory `reduce`) or `PrismaAccountRepository.balance()` (SQL aggregation).

### 2.3 Improvements


## 3. Required Fixes (actionable, in order)

These are confirmed issues that should be fixed before any production release attempt.
### F-03 — Reconcile Next.js documentation against the manifest (C-04)

**Files affected:** `docs/RELEASE_STATUS.md`

### F-05 — Add a unified type-level contract gate (C-06 / I-01)

**Files affected:** root `tsconfig.json` (or a new `tsconfig.base.json`), all three workspace `tsconfig.json` files

**Plan:**
1. Create a root `tsconfig.json` with `references` to `Apps/api/tsconfig.json`, `Apps/Web/tsconfig.json`, `Apps/Mobile/tsconfig.json`, and a root `typecheck` script that runs `tsc -b`.
2. Enable `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`.
3. Run the root typecheck; fix all issues so the monorepo builds in one program.
4. Add a CI step `pnpm typecheck` at root to guarantee the single-program guarantee.

**Acceptance criteria:** Root typecheck is a single command; it fails if either package's public API does not match `packages/contracts`.

### F-06 — Add explicit ownership enforcement and consistent 404/403 semantics (C-08)

**Files affected:** `Apps/api/src/auth/auth.guard.ts`, `Apps/api/src/**/*(service).ts`, `Apps/api/src/**/*(controller).ts`

**Plan:**
1. Introduce a `UserService` that can resolve a `UserRecord` given the `userId` from the request, and a `ResourceOwnership` guard that verifies `target.userId === request.userId` for a given model type.
2. Audit every service method that accepts `userId` (accounts, transactions, categories, budgets, goals, transfers) and ensure ownership is checked by the same guard.
3. Ensure the "404 hides other users' resources" rule is consistent across all endpoints; the rule must be a documented property of the guard, not a per-service decision.

**Acceptance criteria:** All financial endpoints enforce ownership; a cross-user request returns 404 (never 403 for privacy); the guard is centrally testable.

### F-07 — Replace SQL string interpolation in Prisma repositories (C-09)

**Files affected:** `Apps/api/src/database/repositories/prisma-*.repository.ts`

**Plan:**
1. Replace all `::uuid` casts with `Prisma`'s parameterized APIs (e.g., `{ id: accountId }` directly with `where: { id, userId }`).
2. Where `Prisma.sql` is used, keep it and ensure all values are passed as parameters (never interpolated).
3. Add regression tests that attempt to pass SQL metacharacters and confirm they are rejected.

**Acceptance criteria:** Zero template-string SQL injections in the repo; all SQL uses parameterized queries; test suite includes an injection negative case.

### F-08 — Add a single DB readiness gate for all endpoints (C-02 + P-01)

**Files affected:** `Apps/api/src/database/prisma.service.ts`, `Apps/api/src/config/production.ts`

**Plan:**
1. Add a `PrismaService` `assertReady()` that verifies the generated client and schema are coherent (already present).
2. Expose a `/ready` endpoint that uses an in-memory `ReadyState` that is set to `ready` only after `assertReady()` resolves, and not before.
3. Ensure that the `/health` endpoint remains cheap (`{"status":"ok"}`), while `/ready` does the DB check.

**Acceptance criteria:** `/ready` succeeds after DB is up, fails before (or returns `503`) if DB is down; `/health` is independent.

**Plan:**
1. Update the `## Next.js support lifecycle` section to state the current pin (`next@16.4.0`, `next@16.4.0` framework) and the status of the upgrade.
2. Remove the claim that the app "still pins Next.js 13.5.1"; replace with the actual observed pin and the verification status.
3. Update the `## Release principle` to reflect the current CI state, since the audit date is after the release doc's date.
4. Verify the release doc's claim of `275 TypeScript/TSX/TS/JS files parsed with zero syntax diagnostics` by re-running the TS parser on the whole source tree (or a representative sample) if feasible.

**Acceptance criteria:** The documentation and the package manifest agree. The release doc is updated to reflect the current (2026-10-15) state.

### F-04 — Remove obsolete cross-platform workspace path notes (C-05)

**Files affected:** `docs/project-lifecycle.md`

## 4. Suggested Improvements (architecture, security, maintainability)

### 4.1 Architecture & maintainability

### 4.3 Performance

| # | Description | Benefit | Cost | Priority |
|---|---|---|---|---|
| P-01 | Add Redis or a shared cache for session store in multi-instance deployments (documented limitation today). | Fixes the "in-memory rate limiter/session store does not scale" gap. | High | Medium |
| P-02 | Optimize `accountBalance()` from O(n) per request to a materialized trigger or a SQL aggregation with `FOR UPDATE` locks. | Resolves the O(n) hot path for `GET /accounts` and dashboard. | Low–medium | Medium |
| P-03 | Add DB query batching for dashboard aggregation (already being done in the current `DashboardService.summary()` — verify the current aggregation counts are single-query). | Already partially improved; document the final state. | Low | Low |

### 4.4 Accessibility & UX

| # | Description | Benefit | Cost | Priority |
|---|---|---|---|---|
| A-01 | Pass automated WCAG contrast and keyboard navigation checks on Web (axe-core). | Improves accessibility. | Low | Medium |
| A-02 | Add live region announcements for async mutations (e.g., transfer success) on Mobile. | Better UX. | Low | Low |
| A-03 | Add a "password visibility" toggle on the login/register forms. | Usability. | Low | Low |


| # | Description | Benefit | Cost | Priority |
|---|---|---|---|---|
| I-01 | Introduce a `PersistencyMode` enum and a config provider to replace magic env string checks. | Removes the dual-store ambiguity; makes the switch auditable. | Medium | **High** (blocks production readiness) |
| I-02 | Add a root `tsconfig` with project references and a single `tsc -b` typecheck. | One program across all three apps; cross-package type safety. | Low–medium | **High** |
| I-03 | Move `Apps/api/test/` into a `test/api` workspace or use a shared test harness for contract + scenario tests. | Reduces duplication across `@finora/api`, Web, Mobile test suites. | Medium | Medium |
| I-04 | Add a shared "financial scenario" runner that consumes the JSON fixtures in `tests/fixtures/financial-scenarios/` for all three apps. | Guarantees a single set of golden scenarios across API, Web, Mobile. | Medium | Medium |
| I-05 | Document the full deployment topology: how to wire the real API into Web and Mobile, how to rotate secrets (there is no secrets store today). | Operational clarity. | Low | Medium |
| I-06 | Iterate the backup/restore script: add checksum verification and a `restore` smoke test against a scratch DB. | Operational safety. | Low | Medium |


## 5. Technical Debt

### 5.1 Accumulated debt

### 5.2 Expected impact of the debt

If left unaddressed, the highest-risk debts are:

1. **Dual-store ambiguity** → a misconfigured production build silently uses the in-memory (non-persistent) store, losing all user data.
2. **No DB readiness gate** → the platform routes traffic to a broken API; corrupted balances.
3. **Untested prod persistence path** → a financial mutation that works in memory may fail (or double-count) in production SQL, and the failure mode is unknown.
4. **Auth consistency** → revocation may not propagate across the in-memory/persisted boundary, leaving revoked sessions active.


| Area | Debt | Impact | Suggested action |
|---|---|---|---|

## 6. Test & Verification Plan

### 6.1 Current coverage

| App | Command | Result | Notes |
|---|---|---|---|
| `@finora/api` | `pnpm test` (jest) | 19 suites, 136 tests passed, **0 failed**, 21 skipped | Skipped suites are Prisma/DB-gated; the `test:production` job sets `ENABLE_PRISMA=true` and runs a separate e2e suite against a real Postgres (defined as `test:production.spec.ts`) |
| `nextjs` (Web) | `pnpm test` (vitest) | 13 files, 58 tests passed | Includes HTML adapter contract tests, mock-adapter financial tests, pagination boundary tests, and UI tests |
| `finora-mobile` | `pnpm test` (jest) | 10 suites / 58 tests passed | |
| Contracts | `api/contract-shapes-drift.spec.ts` | Static scan + runtime envelope assertions | Ensures the OpenAPI models, DTOs, and responses match `packages/contracts` |

### 6.2 Coverage gaps

- **No multi-instance concurrency test** for `ENABLE_PRISMA=true` — the CI runs a single instance; concurrent refresh rotation across two instances is not verified in CI (documented as a limitation of the in-memory single-instance setup).
- **No privilege/regression test for archived-account exclusion** beyond a few unit tests.
- **No negative SQL injection test** against `prisma-*.repository.ts` (see C-09).
- **No end-to-end test of the real Web + real API + real Mobile path simultaneously**; the smoke gate is triggered only when `FINORA_HTTP_SMOKE=1`.
- **No load/perf test** for `accountBalance()` or dashboard aggregation.
- **No official store-build verification** of Mobile (iOS requires macOS).

### 6.3 Required test scenarios (not yet covered)

1. **Transfer invariant**: given balances, a transfer must preserve the total. (Covered in `financial-scenarios.spec.ts` but only in-memory.)

## 7. Implementation Roadmap (ordered)

The roadmap is ordered by **risk first**, then **value**, and notes dependencies and acceptance criteria.

### Phase 3 — Client trust and production readiness (1–2 weeks)

| Task | Priority | Effort | Acceptance criteria |
|---|---|---|---|
| T-13 Replace the default mock adapters for Web and Mobile with a `NEXT_PUBLIC_API_MODE`/`EXPO_PUBLIC_USE_REAL_API=1` default and update the smoke test. | High | 2 d | CI runs the Web http smoke test without extra env flags. |
| T-14 Add a production load/perf test for `GET /accounts` and dashboard in Prisma mode. | Medium | 2 d | Performance regression thresholds documented. |
| T-15 Add RBAC skeleton (role claims in token, guard) as a future-proofing step. | Medium | 1 d | The auth module supports role claims; a role-guard is implemented but not yet enforced. |
| T-16 Add audit logging (append-only, DB or file) for all financial mutations. | Medium | 2 d | Every create/update/archive event writes an immutable audit record. |
| T-17 Add Prometheus `/metrics` endpoint and basic alerting. | Medium | 2 d | Metrics are exposed and exporters work. |

### Phase 4 — Observability & operational hardening (1–2 weeks)

| Task | Priority | Effort | Acceptance criteria |
|---|---|---|---|
| T-18 Set up structured logging with `requestId` propagation. | Medium | 1 d | Logs include `x-request-id` and correlate across services. |
| T-19 Set up backup/restore script verification against a scratch DB. | Medium | 1 d | A restore test succeeds and schema validation passes. |
| T-20 Add metrics for error rate, latency, and DB pool usage. | Medium | 2 d | Dashboard reflects health of the API. |
| T-21 Add Nightly CI for Web + Mobile real-adapter smoke tests (scheduled). | Medium | 1 d | The scheduled workflow runs the `FINORA_HTTP_SMOKE=1` test on a schedule. |

### Phase 5 — Certification (0.5–1 day)

| Task | Priority | Effort | Acceptance criteria |
|---|---|---|---|
| T-22 Run the full clean-checkout CI from the release document; record the results in a new `docs/CI_VERIFICATION.md` (or update the release doc). | High | 1 d | All gates pass; the project still cannot be certified "GO" until real DB concurrency is exercised. |

### Roadmap summary

| Phase | Risk reduced | Effort (days) |
|---|---|---|
| 0 Docs/governance | Confusion | 2 |
| 1 Typing/dependency | Type safety | 2 |
| 2 Persistence/correctness | Financial correctness | 4 |
| 3 Client trust/prod readiness | Real-world correctness | 7 |
| 4 Observability | Operational safety | 4 |
| 5 Certification | Confidence | 1 |
| **Total** | **~20 days** of focused effort | |


### Phase 0 — Documentation and governance (0–2 days)

| Task | Priority | Effort | Acceptance criteria |
|---|---|---|---|
| T-01 Update `docs/RELEASE_STATUS.md` to match the current nextjs pin and correct runtime status. | High | 0.5 d | Docs match manifest; release doc states the correct certification gate. |
| T-02 Reconcile `docs/project-lifecycle.md` stale statements (Next.js version, workspace paths, mock defaults). | Medium | 0.5 d | Docs match code + lockfile. |
| T-03 Add a root `CONTRIBUTING.md` describing the dual-store design and the env switch, with a diagram. | Medium | 1 d | Contributors can build/run the API in either mode consistently. |

### Phase 1 — Dependency and typing hardening (1–2 days)

## 8. Open Decisions

These items require explicit decisions from maintainers before implementation.


## 9. Severity classification reference

## 10. Verification summary (what was actually inspected)

**Inspected (static, read-only):**
- Full monorepo file tree (excluding `node_modules` and `.git`).
- Root config: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `.gitignore`.
- `prisma/schema.prisma` + all 8 migrations.
- `apps/api/src/**` — all controllers, services, guards, repositories, filters, middlewares, DTOs, swagger schemas, and the `main.ts` bootstrap.
- `apps/api/src/database/` — Prisma service, `prisma-financial` locking module, and all repository implementations.
- `apps/api/test/` — all 22 test files (financial-scenarios, contract-shapes-drift, api-contract, dashboard-parity, transfer-parity, goal-budget-integrity, prisma-financial, etc.).
- `apps/Web/` — `package.json`, `next.config.js`, `lib/*.ts`, `tests/**`, `app/**`.
- `apps/Mobile/` — `package.json`, `app/**`, `lib/api/**`, `lib/auth/**`, `lib/network/**`, `lib/storage/**`, `types/contract.ts`, and test dirs.
- `packages/contracts/src/index.ts` — canonical resources, field manifests, error codes, currencies.
- `packages/domain/src/money.ts` — `Money` class.
- `docs/` — architecture, business rules, ADR, contracts, release status, project lifecycle, operations, product scope/vision.
- `scripts/` — backup/restore and local-start helpers.
- `.github/workflows/ci.yml` — CI pipeline steps.
- Test fixtures (`tests/fixtures/financial-scenarios/*`).

**NOT inspected (could not be executed in this sandbox):**
- `pnpm install --frozen-lockfile` (no registry access).
- Prisma client generation (`db:generate`).
- Live PostgreSQL tests (no DB host).
- Web `next build` / Mobile `expo export` (no Android SDK / macOS).
- Real Web/Mobile → API end-to-end smoke (requires `FINORA_HTTP_SMOKE=1` + a live API).
- Any change to the source tree (audit was read-only).

**A note on the Next.js discrepancy (C-04):** The most important finding is that `docs/RELEASE_STATUS.md` (dated 2026-09-27) contradicts the current `Apps/Web/package.json` manifest (`next@16.4.0`). This is a documentation defect, not a codebase defect; I recommend correcting the docs rather than changing the code.

---

*End of document. Prepared by Principal Software Architect + Senior Code Auditor. Audit performed 2026-10-15. Read-only; no files modified.*


| Label | Meaning |
|---|---|
| **CRITICAL** | Blocks production certification; data loss, financial correctness, or security risk. |
| **HIGH** | Major reliability/security gap; should be fixed before release. |
| **MEDIUM** | Should be fixed before scaling; risk is manageable with other controls. |
| **LOW** | Improvement for UX/observability/maintainability. |
| **POTENTIAL** | Likely issue whose impact depends on runtime configuration; validate before fixing. |

| # | Question | Options | Recommendation |
|---|---|---|---|
| D-01 | **Should the in-memory store be removed entirely, or kept as the default?** | (a) Remove in-memory store and make Prisma the only store. (b) Keep in-memory default but document it strictly as "development only" and block it in CI for all non-test builds. | (b) — lower risk, preserves dev ergonomics; but it must be blocked in any non-`test` build via CI. |
| D-02 | **Should the project add a real secret manager or stay with env-file-based config?** | (a) Keep env-file config (already gitignored). (b) Add a secrets manager integration. | (a) — MVP uses ephemeral secrets; keep the gitignored template. |
| D-03 | **Should Web and Mobile default to real API by default in production builds?** | (a) Default to mock; require explicit flag. (b) Default to real API in production, to mock only in development. | (b) — safer; production builds should never silently use a mock adapter. |
| D-04 | **Should the release status move to "certified GO" after the runtime gates are proven green?** | (a) Yes, after T-13/T-15/T-16 pass. (b) Not yet — privacy/observability are still missing. | (b) — privacy/observability are necessary for compliance; hold "GO" until audit logging and metrics are in place. |
| D-05 | **Should the API type-check be a single monorepo program or per-application?** | (a) Single `tsc -b`. (b) Per-application continues. | (a) — costs little and catches contract drift. |


| Task | Priority | Effort | Acceptance criteria |
|---|---|---|---|
| T-04 Create root `tsconfig` + single `pnpm typecheck`. | High | 1 d | `pnpm typecheck` (root) succeeds; per-project typecheck passes too. |
| T-05 Enable `strict`, `noUncheckedIndexedAccess` across all three workspaces. | High | 1 d | `tsc --noEmit` passes with zero new errors. |
| T-06 Standardize dependency versions to supported LTS lines (notably `next`). | Low–medium | 0.5 d | `pnpm audit --prod --audit-level high` reports no high vulnerabilities in the app workspace. |

### Phase 2 — Persistence and correctness (2–4 days)

| Task | Priority | Effort | Acceptance criteria |
|---|---|---|---|
| T-07 Replace magic env string `ENABLE_PRISMA === "true"` with a validated `PersistencyMode`. | High | 1 d | No string-comparison remains; a config object is injected into services. |
| T-08 Add a documented, tested migration path between both persistence modes. | High | 1 d | A documented procedure + test (export from one, import into the other) succeeds. |
| T-09 Add DB readiness probe to `/ready` that queries PostgreSQL. | High | 0.5 d | `/ready` returns 503/DB-error when DB is down. |
| T-10 Fix all SQL string interpolation in `prisma-*.repository.ts`; add injection regression test. | High | 1 d | Static scan finds no `::uuid` casts; injected string is rejected by tests. |
| T-11 Add a single DB concurrency test: simultaneous refreshes (two simulated clients) → exactly one new token is issued. | High | 1 d | The test passes in CI with `ENABLE_PRISMA=true`. |
| T-12 Add pessimistic locking for budget/goal write conflicts (in addition to transfer locks). | Medium | 1 d | Concurrent budget updates serialize; no lost updates. |

2. **Cross-tenant isolation**: a user must not be able to read another user's account/transaction. (Covered via `404` in the test fixtures and an e2e spec.)
3. **Idempotent replay with different payload**: same key + different amount → `409`. (Covered in `financial-scenarios.spec.ts` but in-memory.)
4. **Concurrent refresh rotation** across two simulated nodes (no shared store). (Documented as open.)
5. **Budget usage drift** when a transfer is voided mid-month (should not affect the budget because budget spends only real expenses, but verify).
6. **Goal completion race**: two concurrent requests where one sets the goal `COMPLETED` and the other attempts to archive the account. (Covered partially in e2e.)
7. **SQL injection** negative test against the repositories.
8. **Multi-device concurrency**: two devices performing different financial mutations simultaneously on the same account → no double-spend.

| Persistence | Dual-store ambiguity (two sources of truth governed by an env flag) | Data loss on restart, config drift | **F-01** |
| Auth | Dual store sessions + in-memory caches; revocation semantics differ by mode | Stale sessions not revoked | **F-05/F-06** |
| Docs | Release doc and lifecycle doc are stale relative to current code | Confused operators, wrong migration decisions | **F-03, F-04** |
| Testing | Contract test coverage is rich but only covers the in-memory branch and selected DB branch | Real DB concurrency untested | **F-01** + new DB concurrency e2e |
| Build | Prisma client generation not guaranteed in CI build order (CI does generate before build, but documented scripts don't enforce) | Stale client possible | **P-07** |
| Monorepo | Three separate tsconfigs, no shared base | Cross-package type drift | **I-01/I-02** |
| Missing | No metrics/alerts/audit logging | Operational blind spots | **S-02/S-06** |

### 4.2 Security & resilience

| # | Description | Benefit | Cost | Priority |
|---|---|---|---|---|
| S-01 | Add a global rate limiter (or per-account/per-user sliding window) to the API. | Mitigates brute-force and DoS. | Low–medium | **High** |
| S-02 | Add structured audit logging for all financial mutations (user, entity, action, before/after, at timestamp). | Enables audits and fraud investigations. | Medium | **High** |
| S-03 | Add an RBAC/role module (currently absent; MVP may not need it). | Prepares for enterprise features. | Medium | **Medium** |
| S-04 | Add secret rotation for any future credentials; currently there are no secrets in the repo (good) but the `.env` template must be kept up to date. | Operational security hygiene. | Low | Medium |
| S-05 | Add a `PrismaService` connection-pool limiter configuration to avoid DB saturation under load. | Operational resilience. | Low | Medium |
| S-06 | Add pessimistic locking for concurrent budget/goals updates (already partially present in the accounts lock). | Prevents race conditions in financial mutations. | Low–medium | **High** (financial concurrency is the core promise) |


**Plan:**
1. Remove the statement about `apps/*` vs `Apps/*` mismatch, since it is no longer relevant.
2. Keep a note that CI uses absolute workspace paths (`Apps/api`), which is Windows-compatible but not portable.

**Acceptance criteria:** The documentation matches the observed repo layout.


### F-01 — Make dual-store explicit and add a migration path (C-01)

**Files affected:** `Apps/api/src/**/*(service).ts`, `Apps/api/src/database/repositories/prisma-*.repository.ts`, `Apps/api/src/database/database.module.ts`, `Apps/api/src/core/store.ts`

**Plan:**
1. Separate the two modes cleanly with a `PersistencyMode` enum and a config provider (`apps/api/src/config/`). The current `process.env.ENABLE_PRISMA === "true"` string comparison should be replaced with a validated config object.
2. Add a documented migration procedure: when switching from `ENABLE_PRISMA=true` to `false` (or vice versa), the operator must export from one store and import into the other, and never run both stores simultaneously for the same tenant.
3. Add a runtime warning when the in-memory and persisted stores disagree on a key entity (e.g., a session token is in DB but not in store).
4. Add a unit test that boots the API in both modes and verifies the same endpoint returns identical JSON (this already exists via `dashboard-parity.spec.ts` for some paths — extend it to all).

**Acceptance criteria:**
- `ENABLE_PRISMA=false` boot: API can serve reads/writes from memory.
- `ENABLE_PRISMA=true` boot: API can serve reads/writes from DB.
- Data created in one mode is not visible in the other mode after a restart within the same mode (deterministic).
- A documented migration step exists and is covered by a test.

### F-02 — Fix `/ready` probe to include DB check (C-02)

**Files affected:** `Apps/api/src/health/health.controller.ts`, `Apps/api/src/config/production.ts`

**Plan:**
1. Add an optional DB probe: if `ENABLE_PRISMA=true`, call `prisma.db.$queryRaw` `SELECT 1` and return `{"status":"ready","database":"ok"}`; otherwise return `{"status":"ready","database":"disabled"}` so that the probe is honest about what it checked.
2. Align the controller with the same semantics as `assertReady()` in `PrismaService`.
3. Add a test: stop the Postgres service (or set `ENABLE_PRISMA=true` with unreachable DB) → `/ready` returns non-200 or `{"database":"error"}`.

**Acceptance criteria:** `/ready` returns `200` only when the process is healthy *as far as the probe can determine*; unreachable DB yields a `503` or a `ready` response with `database:error`.

| # | Classification | Title | Location | Value | Cost | Risk |
|---|---|---|---|---|---|---|
| I-01 | Improvement | **Enforce `strict: true` + `noUncheckedIndexedAccess` monorepo-wide** | tsconfigs | Eliminates whole classes of `undefined` and index errors. | Medium effort; must fix existing code. | **Medium** — code changes required, but risk is low with `noEmit`. |
| I-02 | Improvement | **Unified `tsc -b` root build** | root `tsconfig.json` | Single program across packages; single source of truth for types. | Low effort; improves reliability. | **Low** — preferrable to the current per-project approach. |
| I-03 | Improvement | **Add a root `tsconfig` with references and a `typecheck` script** | root `tsconfig.json` | The same as I-02 but presented as an actionable task. | — | — |
| I-04 | Improvement | **Plan for privilege escalation / role-based access** | `AuthGuard`, `PrismaAuthRepository` | The MVP does not have roles, but the docs mention behaviors that may need them later. | Low effort if done early. | **Low**. |
| I-05 | Improvement | **Audit logging and compliance export** | Services + DB migration | Provide an append-only audit log for disputes. | High effort. | **Medium**. |
| I-06 | Improvement | **Observability stack (metrics, traces, logs)** | All services | Add OpenTelemetry/Prometheus/Grafana. | High effort. | **Medium**. |
| I-07 | Improvement | **Structured error messages with requestId correlation** | `ApiExceptionFilter` | The `requestId` is already present in every error; propagate to all logs. | Low effort. | **Low**. |
| I-08 | Improvement | **Rate-limit financial endpoints globally** | API gateway / NestJS middleware | Prevent brute force / DoS. | Medium effort. | **Medium**. |


### 1.5 Data model (PostgreSQL)

Prisma schema (verified): 8 enums — `AccountType`, `AccountStatus`, `TransactionType`, `TransactionStatus`, `CategoryType`, `CategoryStatus`, `GoalStatus`, `TransferDirection`. 8 models — `User`, `Account`, `Transaction`, `Category`, `Transfer`, `Budget`, `SavingsGoal`, `Session`. Constraints: positive `amount_minor`, non-negative `opening_balance_minor` and `limit_minor`, month in 1..12, positive `target_amount_minor`, and indexes for `(user_id, transactionDate)`, `(accountId, status)`, `(categoryId, status, transactionDate)`, transfers by `(user_id, idempotencyKey)`, budgets by `(user_id, category_id, year, month)`, and savings_goals by `account_id`.

| Money domain | Pure TS `bigint` minor units | — |
| Auth | Opaque bearer session tokens (SHA-256 hashed at rest), 30-day expiry, session revocation + rotation | — |
| Testing API | jest | 29.7.0 |
| Testing Web | vitest + Testing Library | 1.6.1 / 14.2.1 |
| Testing Mobile | jest + jest-expo + @testing-library/react-native | 29.7.0 |

- TypeScript strictness is not uniformly `strict` across the monorepo (see §4.1).
- The release checklist is incomplete: `db:validate`, `prisma migrate deploy`, real concurrency smoke and private-key/store-identity checks were not run in this environment.
- `pnpm-workspace.yaml` declares `apps/*` (lowercase) while the actual layout uses `Apps/*`; CI uses absolute `Apps/api` paths which work on Windows, but the mismatch can break Linux/CI.


| Priority | Risk | Reason |
|---|---|---|
| CRITICAL | **Dual-source-of-truth persistence architecture** | `InMemoryStore` vs Prisma repositories both survive as the data source depending on `ENABLE_PRISMA`. Data loss on restart by design in dev mode; a partial/misconfigured deployment can silently split state across two stores. |
| CRITICAL | **Production certification is not complete** | Release doc explicitly says NOT certified GO. Runtime CI gates (registry install, Prisma generation, live concurrency, real client smoke) were not executable. |
| HIGH | **Default mock adapters for Web/Mobile** | Web and Mobile default to mock servers; only the contract tests assert parity. Real end-to-end integration is not on by default and therefore not real-world verified. |
| HIGH | **Next.js version documentation drift** | `Apps/Web/package.json` pins `next@16.4.0` (current LTS as of audit). `docs/RELEASE_STATUS.md` (dated 2026-09-27) still claims the app "pins Next.js 13.5.1". This contradicts the code; the docs must be reconciled. |
| HIGH | **No live production readiness probe** | `/ready` probe returns `{"status":"ok"}` without checking PostgreSQL. A failed DB would not block startup. |
| MEDIUM | **No secrets management / observability / alerting** | No documented secret store, no metrics, no logs aggregation, no health monitoring beyond the `health`/`ready` endpoints. |
