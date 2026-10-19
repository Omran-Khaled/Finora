import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request = require('supertest');
import {
  ACCOUNT_API_FIELDS,
  BUDGET_API_FIELDS,
  CATEGORY_API_FIELDS,
  CREATE_ACCOUNT_REQUEST_FIELDS,
  CREATE_BUDGET_REQUEST_FIELDS,
  CREATE_CATEGORY_REQUEST_FIELDS,
  CREATE_SAVINGS_GOAL_REQUEST_FIELDS,
  CREATE_TRANSACTION_REQUEST_FIELDS,
  CREATE_TRANSFER_REQUEST_FIELDS,
  DASHBOARD_BUDGET_API_FIELDS,
  DASHBOARD_GOAL_API_FIELDS,
  DASHBOARD_SUMMARY_API_FIELDS,
  LOGIN_REQUEST_FIELDS,
  REGISTER_REQUEST_FIELDS,
  SAVINGS_GOAL_API_FIELDS,
  TRANSACTION_API_FIELDS,
  TRANSACTION_FILTER_REQUEST_FIELDS,
  TRANSFER_API_FIELDS,
  UPDATE_ACCOUNT_REQUEST_FIELDS,
  UPDATE_BUDGET_REQUEST_FIELDS,
  UPDATE_CATEGORY_REQUEST_FIELDS,
  UPDATE_PROFILE_REQUEST_FIELDS,
  UPDATE_SAVINGS_GOAL_REQUEST_FIELDS,
  UPDATE_TRANSACTION_REQUEST_FIELDS,
  UPDATE_TRANSFER_REQUEST_FIELDS,
  USER_API_FIELDS,
} from '@finora/contracts';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';

// F-010 / M-002 — canonical resource + request shape drift guard.
//
// `packages/contracts` owns the public API shapes (`*_API_FIELDS` for resources,
// `*_REQUEST_FIELDS` for request bodies/queries). This suite asserts the two
// independent artefacts that must never drift away from that package:
//
//   1. the OpenAPI models (`src/swagger/schemas.ts`) and the NestJS DTOs
//      (`src/**/*.dto.ts`) — static source scan, and
//   2. the live HTTP responses of a booted Nest application — runtime assertion.
//
// Field order is irrelevant everywhere: only the field *sets* are compared.
jest.setTimeout(60000);

const repoRoot = resolve(__dirname, '..', '..', '..');

/** Property names of `export class <className> { ... }` in a TypeScript source file. */
function classProperties(source: string, className: string): string[] {
  const header = `export class ${className} {`;
  const start = source.indexOf(header);
  if (start === -1) throw new Error(`class ${className} not found in source`);
  const body = source.slice(start + header.length);
  const end = body.indexOf('\n}');
  if (end === -1) throw new Error(`class ${className} is not closed in source`);
  const fields: string[] = [];
  for (const line of body.slice(0, end).split('\n')) {
    const match = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)[!?]:/);
    if (match) fields.push(match[1]);
  }
  return fields;
}

function source(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

const swaggerSource = source(join('Apps', 'api', 'src', 'swagger', 'schemas.ts'));

function dtoProperties(relativePath: string, className: string): string[] {
  return classProperties(source(join('Apps', 'api', 'src', relativePath)), className);
}

describe('OpenAPI models match the canonical resource manifests', () => {
  it.each([
    ['UserProfile', USER_API_FIELDS],
    ['Account', ACCOUNT_API_FIELDS],
    ['Category', CATEGORY_API_FIELDS],
    ['Transaction', TRANSACTION_API_FIELDS],
    ['Transfer', TRANSFER_API_FIELDS],
    ['Budget', BUDGET_API_FIELDS],
    ['Goal', SAVINGS_GOAL_API_FIELDS],
    ['DashboardBudgetSnapshot', DASHBOARD_BUDGET_API_FIELDS],
    ['DashboardGoalSnapshot', DASHBOARD_GOAL_API_FIELDS],
    ['DashboardSummary', DASHBOARD_SUMMARY_API_FIELDS],
  ])('the OpenAPI model %s documents exactly the canonical fields', (className, manifest) => {
    expect(classProperties(swaggerSource, className).sort()).toEqual([...(manifest as readonly string[])].sort());
  });
});

describe('NestJS DTOs match the canonical request manifests', () => {
  it.each([
    ['auth/auth.dto.ts', 'RegisterDto', REGISTER_REQUEST_FIELDS],
    ['auth/auth.dto.ts', 'LoginDto', LOGIN_REQUEST_FIELDS],
    ['auth/auth.dto.ts', 'UpdateProfileDto', UPDATE_PROFILE_REQUEST_FIELDS],
    ['accounts/accounts.dto.ts', 'CreateAccountDto', CREATE_ACCOUNT_REQUEST_FIELDS],
    ['accounts/accounts.dto.ts', 'UpdateAccountDto', UPDATE_ACCOUNT_REQUEST_FIELDS],
    ['categories/categories.dto.ts', 'CreateCategoryDto', CREATE_CATEGORY_REQUEST_FIELDS],
    ['categories/categories.dto.ts', 'UpdateCategoryDto', UPDATE_CATEGORY_REQUEST_FIELDS],
    ['transactions/transactions.dto.ts', 'CreateTransactionDto', CREATE_TRANSACTION_REQUEST_FIELDS],
    ['transactions/transactions.dto.ts', 'ListTransactionsQuery', TRANSACTION_FILTER_REQUEST_FIELDS],
    ['transactions/transactions.dto.ts', 'UpdateTransactionDto', UPDATE_TRANSACTION_REQUEST_FIELDS],
    ['transfers/transfers.dto.ts', 'CreateTransferDto', CREATE_TRANSFER_REQUEST_FIELDS],
    ['transfers/transfers.dto.ts', 'UpdateTransferDto', UPDATE_TRANSFER_REQUEST_FIELDS],
    ['budgets/budgets.dto.ts', 'CreateBudgetDto', CREATE_BUDGET_REQUEST_FIELDS],
    ['budgets/budgets.dto.ts', 'UpdateBudgetDto', UPDATE_BUDGET_REQUEST_FIELDS],
    ['goals/goals.dto.ts', 'CreateGoalDto', CREATE_SAVINGS_GOAL_REQUEST_FIELDS],
    ['goals/goals.dto.ts', 'UpdateGoalDto', UPDATE_SAVINGS_GOAL_REQUEST_FIELDS],
  ])('the DTO %s exposes exactly the canonical request fields', (file, className, manifest) => {
    expect(dtoProperties(file, className).sort()).toEqual([...(manifest as readonly string[])].sort());
  });
});

// ---------------------------------------------------------------------------
// Runtime responses
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

interface ShapeOptions {
  /** Aliases the API omits instead of sending `null` (e.g. `transferDirection` on INCOME/EXPENSE rows). */
  optionalAbsent?: readonly string[];
}

function expectCanonicalShape(label: string, payload: Json, manifest: readonly string[], options: ShapeOptions = {}) {
  const keys = Object.keys(payload);
  const allowedAbsent = new Set(options.optionalAbsent ?? []);
  expect({ label, unexpectedFields: keys.filter((key) => !manifest.includes(key)) }).toEqual({ label, unexpectedFields: [] });
  expect({ label, missingFields: manifest.filter((field) => !keys.includes(field) && !allowedAbsent.has(field)) }).toEqual({ label, missingFields: [] });
}

/** Persistence-only columns must never reach an HTTP response. */
function expectNoInternalColumns(label: string, payload: Json) {
  const internal = ['idempotencyKey', 'payloadFingerprint', 'passwordHash'];
  const leaked = Object.keys(payload).filter((key) => internal.includes(key));
  expect({ label, leaked }).toEqual({ label, leaked: [] });
}

describe('runtime responses match the canonical resource manifests', () => {
  const api = '/api/v1';
  const period = { year: 2026, month: 8 };
  let app: INestApplication;
  let token = '';

  let userProfile: Json;
  let createdAccount: Json;
  let createdCategory: Json;
  let createdTransaction: Json;
  let createdTransfer: Json;
  let createdBudget: Json;
  let createdGoal: Json;
  let summary: Json;

  const server = () => request(app.getHttpServer());
  const authed = (test: request.Test): request.Test => test.set('Authorization', `Bearer ${token}`);
  const payloadOf = (response: request.Response): Json => (response.body as { data: Json }).data;
  const bodyOf = (response: request.Response): Json => response.body as Json;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const registration = await server()
      .post(`${api}/auth/register`)
      .send({ email: 'shapes@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    token = String(payloadOf(registration).token);

    userProfile = payloadOf(await authed(server().get(`${api}/auth/me`)).expect(200));

    createdAccount = payloadOf(
      await authed(server().post(`${api}/accounts`))
        .send({ name: 'Shapes Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100000' })
        .expect(201),
    );
    const savings = payloadOf(
      await authed(server().post(`${api}/accounts`))
        .send({ name: 'Shapes Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' })
        .expect(201),
    );

    createdCategory = payloadOf(
      await authed(server().post(`${api}/categories`)).send({ name: 'Shapes Groceries', type: 'EXPENSE' }).expect(201),
    );

    createdTransaction = payloadOf(
      await authed(server().post(`${api}/transactions`))
        .set('Idempotency-Key', 'shapes-expense-key')
        .send({
          type: 'EXPENSE',
          accountId: createdAccount.id,
          categoryId: createdCategory.id,
          amountMinor: '1500',
          description: 'Shape check',
          transactionDate: `${period.year}-08-15`,
        })
        .expect(201),
    );

    createdTransfer = payloadOf(
      await authed(server().post(`${api}/transfers`))
        .set('Idempotency-Key', 'shapes-transfer-key')
        .send({
          fromAccountId: createdAccount.id,
          toAccountId: savings.id,
          amountMinor: '2500',
          transactionDate: `${period.year}-08-16`,
        })
        .expect(201),
    );

    createdBudget = payloadOf(
      await authed(server().post(`${api}/budgets`))
        .send({ categoryId: createdCategory.id, year: period.year, month: period.month, limitMinor: '30000' })
        .expect(201),
    );

    createdGoal = payloadOf(
      await authed(server().post(`${api}/savings-goals`))
        .send({ accountId: savings.id, name: 'Shape Goal', targetAmountMinor: '50000' })
        .expect(201),
    );

    summary = payloadOf(
      await authed(server().get(`${api}/dashboard/summary?year=${period.year}&month=${period.month}`)).expect(200),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/me returns exactly the canonical User fields', () => {
    expectCanonicalShape('GET /auth/me', userProfile, USER_API_FIELDS);
    expectNoInternalColumns('GET /auth/me', userProfile);
  });

  it('POST /accounts and GET /accounts return exactly the canonical Account fields', async () => {
    expectCanonicalShape('POST /accounts', createdAccount, ACCOUNT_API_FIELDS);
    expectNoInternalColumns('POST /accounts', createdAccount);

    const list = await authed(server().get(`${api}/accounts?limit=50`)).expect(200);
    const items = payloadOf(list) as unknown as Json[];
    expect(items.length).toBeGreaterThan(0);
    for (const account of items) {
      expectCanonicalShape('GET /accounts[]', account, ACCOUNT_API_FIELDS);
      expectNoInternalColumns('GET /accounts[]', account);
    }
  });

  it('POST /categories and GET /categories return exactly the canonical Category fields', async () => {
    expectCanonicalShape('POST /categories', createdCategory, CATEGORY_API_FIELDS);

    const list = await authed(server().get(`${api}/categories?limit=50`)).expect(200);
    const items = payloadOf(list) as unknown as Json[];
    expect(items.length).toBeGreaterThan(0);
    for (const category of items) expectCanonicalShape('GET /categories[]', category, CATEGORY_API_FIELDS);
  });

  it('POST /transactions returns the canonical Transaction fields without the idempotency fingerprint', () => {
    expectCanonicalShape('POST /transactions', createdTransaction, TRANSACTION_API_FIELDS, {
      optionalAbsent: ['transferDirection'],
    });
    expectNoInternalColumns('POST /transactions', createdTransaction);
    expect(createdTransaction.transferDirection).toBeUndefined();
  });

  it('GET /transactions returns canonical rows and only transfer legs carry a direction', async () => {
    const list = await authed(server().get(`${api}/transactions?limit=50`)).expect(200);
    const items = payloadOf(list) as unknown as Json[];
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const transaction of items) {
      expectCanonicalShape('GET /transactions[]', transaction, TRANSACTION_API_FIELDS, {
        optionalAbsent: ['transferDirection'],
      });
      expectNoInternalColumns('GET /transactions[]', transaction);
    }
    const directions = items.map((item) => item.transferDirection).filter((value) => value !== undefined);
    expect(directions.sort()).toEqual(['DESTINATION', 'SOURCE']);
  });

  it('POST /transfers returns the canonical Transfer envelope (transfer + both legs)', () => {
    expect(Object.keys(createdTransfer).sort()).toEqual(['destinationTx', 'sourceTx', 'transfer']);
    expectCanonicalShape('POST /transfers transfer', createdTransfer.transfer as Json, TRANSFER_API_FIELDS);
    expectCanonicalShape('POST /transfers sourceTx', createdTransfer.sourceTx as Json, TRANSACTION_API_FIELDS);
    expectCanonicalShape('POST /transfers destinationTx', createdTransfer.destinationTx as Json, TRANSACTION_API_FIELDS);
    expect((createdTransfer.sourceTx as Json).transferDirection).toBe('SOURCE');
    expect((createdTransfer.destinationTx as Json).transferDirection).toBe('DESTINATION');
  });

  it('POST /budgets returns exactly the canonical Budget fields', () => {
    expectCanonicalShape('POST /budgets', createdBudget, BUDGET_API_FIELDS);
    expectNoInternalColumns('POST /budgets', createdBudget);
  });

  it('POST /savings-goals returns exactly the canonical SavingsGoal fields', () => {
    expectCanonicalShape('POST /savings-goals', createdGoal, SAVINGS_GOAL_API_FIELDS);
  });

  it('GET /dashboard/summary returns the canonical summary, budget and goal shapes', () => {
    expectCanonicalShape('GET /dashboard/summary', summary, DASHBOARD_SUMMARY_API_FIELDS);

    const budgets = summary.budgets as Json[];
    expect(budgets.length).toBeGreaterThan(0);
    for (const budget of budgets) {
      expectCanonicalShape('GET /dashboard/summary budgets[]', budget, DASHBOARD_BUDGET_API_FIELDS);
    }

    const goals = summary.goals as Json[];
    expect(goals.length).toBeGreaterThan(0);
    for (const goal of goals) {
      expectCanonicalShape('GET /dashboard/summary goals[]', goal, DASHBOARD_GOAL_API_FIELDS);
    }
  });

  it('list endpoints return the canonical collection envelope', async () => {
    const envelope = bodyOf(await authed(server().get(`${api}/accounts?limit=1`)).expect(200));
    expect(Object.keys(envelope).sort()).toEqual(['data', 'meta']);
    const meta = envelope.meta as Json;
    expect(Object.keys(meta)).toEqual(['nextCursor']);
    // Two accounts exist, so the keyset cursor of page one points at page two.
    expect(typeof meta.nextCursor).toBe('string');
  });

  it('failures return the canonical error envelope', async () => {
    const envelope = bodyOf(await server().get(`${api}/accounts`).expect(401));
    expect(Object.keys(envelope)).toEqual(['error']);
    const error = envelope.error as Json;
    expect(Object.keys(error).sort()).toEqual(['code', 'message', 'requestId']);
    expect(error.code).toBe('UNAUTHORIZED');
  });
});

