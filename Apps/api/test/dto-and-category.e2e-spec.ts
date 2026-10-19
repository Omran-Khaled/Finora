import { INestApplication, NotFoundException, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';
import { InMemoryStore } from '../src/core/store';
import { TransactionsService } from '../src/transactions/transactions.service';
import { PrismaAccountRepository } from '../src/database/repositories/prisma-account.repository';
import { PrismaCategoryRepository } from '../src/database/repositories/category.repository';
import { PrismaTransactionRepository } from '../src/database/repositories/transaction.repository';

describe('query/patch DTOs + category parity', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function signUp(email: string) {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    return registration.body.data.token as string;
  }

  async function createAccount(token: string, openingBalanceMinor = 500000) {
    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor })
      .expect(201);
    return account.body.data.id as string;
  }

  async function createCategory(token: string, name: string) {
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'EXPENSE' })
      .expect(201);
    return category.body.data.id as string;
  }

  describe('B-004 — GET /transactions accepts optional filters', () => {
    it('returns the bare list without requiring body fields', async () => {
      const token = await signUp('b004-bare@example.com');
      const response = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('accepts accountId + from + type + limit + cursor and filters the results', async () => {
      const token = await signUp('b004-filters@example.com');
      const bank = await createAccount(token);
      const categoryId = await createCategory(token, 'Groceries');

      const expense = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Idempotency-Key', 'e2e-transaction-dto-and-category.e2e-spec-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'EXPENSE', accountId: bank, categoryId, amountMinor: '1500', transactionDate: '2026-08-10' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Idempotency-Key', 'e2e-transaction-dto-and-category.e2e-spec-2')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'INCOME', accountId: bank, amountMinor: '9000', transactionDate: '2026-07-01' })
        .expect(201);

      const filtered = await request(app.getHttpServer())
        .get(`/api/v1/transactions?accountId=${bank}&from=2026-08-01&type=EXPENSE&limit=20`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(filtered.body.data).toHaveLength(1);
      expect(filtered.body.data[0].amountMinor).toBe('1500');
      expect(filtered.body.meta.nextCursor).toBeNull();

      // P-001: `cursor` is a real keyset cursor. Cursoring past the last returned
      // row ends the sequence (no duplicate, no phantom page).
      const afterCursor = await request(app.getHttpServer())
        .get(`/api/v1/transactions?accountId=${bank}&from=2026-08-01&type=EXPENSE&limit=20&cursor=${expense.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(afterCursor.body.data).toEqual([]);
    });
  });

  describe('B-005 — PATCH /budgets/:id accepts a limit-only payload', () => {
    it('updates the limit without the create fields', async () => {
      const token = await signUp('b005@example.com');
      const categoryId = await createCategory(token, 'Bills');
      const budget = await request(app.getHttpServer())
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryId, year: 2026, month: 8, limitMinor: '300000' })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/budgets/${budget.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ limitMinor: '500' })
        .expect(200);

      expect(updated.body.data.limitMinor).toBe('500');
    });
  });

  describe('B-006 — PATCH /savings-goals/:id rename + optional targetDate', () => {
    // POST /auth/register is rate limited to 10 attempts/min/IP and every
    // describe in this file shares one app instance, so this suite registers
    // exactly once and reuses the session token.
    let token: string;

    beforeAll(async () => {
      token = await signUp('b006@example.com');
    });

    async function createGoal(name: string, extra: Record<string, unknown> = {}) {
      const savings = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' })
        .expect(201);

      const goal = await request(app.getHttpServer())
        .post('/api/v1/savings-goals')
        .set('Authorization', `Bearer ${token}`)
        .send({ accountId: savings.body.data.id, name, targetAmountMinor: '120000', ...extra })
        .expect(201);
      return goal.body.data as { id: string; targetDate: string | null };
    }

    it('creates a goal without a target date and renames it with a name-only payload', async () => {
      const goal = await createGoal('Laptop');
      expect(goal.targetDate).toBeNull();

      const renamed = await request(app.getHttpServer())
        .patch(`/api/v1/savings-goals/${goal.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Laptop Pro' })
        .expect(200);

      expect(renamed.body.data.name).toBe('Laptop Pro');
    });

    it('rejects target fields instead of silently ignoring them (PATCH is rename-only)', async () => {
      const goal = await createGoal('Laptop', { targetDate: '2027-06-01' });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/savings-goals/${goal.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Laptop Pro', targetAmountMinor: '999999', targetDate: '2028-01-01' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      // The goal is untouched: the rejected payload never reached the service.
      const unchanged = await request(app.getHttpServer())
        .get(`/api/v1/savings-goals/${goal.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(unchanged.body.data.name).toBe('Laptop');
      expect(unchanged.body.data.targetAmountMinor).toBe('120000');
      expect(unchanged.body.data.targetDate).toBe('2027-06-01');
    });
  });

  describe('PATCH /categories/:id — rename-only DTO contract', () => {
    // Register once: see the rate-limit note in the B-006 suite above.
    let token: string;

    beforeAll(async () => {
      token = await signUp('patch-category@example.com');
    });

    it('renames an owned active category with a name-only payload', async () => {
      const categoryId = await createCategory(token, 'Groceries');

      const renamed = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Weekly Groceries' })
        .expect(200);

      expect(renamed.body.data.name).toBe('Weekly Groceries');
      expect(renamed.body.data.type).toBe('EXPENSE');
      expect(renamed.body.data.status).toBe('ACTIVE');
    });

    it('rejects create-only fields instead of silently ignoring them', async () => {
      const categoryId = await createCategory(token, 'Type immutability');

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Groceries', type: 'INCOME' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for a system category', async () => {
      const categories = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const systemCategory = categories.body.data.find((item: { isSystem: boolean }) => item.isSystem);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${systemCategory.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Not allowed' })
        .expect(404);

      expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('returns 422 for an archived category', async () => {
      const categoryId = await createCategory(token, 'Archived rename');
      await request(app.getHttpServer())
        .post(`/api/v1/categories/${categoryId}/archive`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed' })
        .expect(422);

      expect(response.body.error.code).toBe('CATEGORY_ARCHIVED');
    });
  });

  describe('A-002 — category ownership/archived parity (memory mode)', () => {
    it('rejects an archived category with 422', async () => {
      const token = await signUp('a002-archived@example.com');
      const accountId = await createAccount(token);
      const categoryId = await createCategory(token, 'Archived category');
      await request(app.getHttpServer())
        .post(`/api/v1/categories/${categoryId}/archive`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Idempotency-Key', 'e2e-transaction-dto-and-category.e2e-spec-3')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'EXPENSE', accountId, categoryId, amountMinor: '100', transactionDate: '2026-08-10' })
        .expect(422);

      expect(response.body.error.code).toBe('CATEGORY_ARCHIVED');
    });

    it('rejects another user category with 404', async () => {
      const owner = await signUp('a002-owner@example.com');
      const intruder = await signUp('a002-intruder@example.com');
      const accountId = await createAccount(intruder);
      const foreignCategory = await createCategory(owner, 'Private category');

      const response = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Idempotency-Key', 'e2e-transaction-dto-and-category.e2e-spec-4')
        .set('Authorization', `Bearer ${intruder}`)
        .send({ type: 'EXPENSE', accountId, categoryId: foreignCategory, amountMinor: '100', transactionDate: '2026-08-10' })
        .expect(404);

      expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('accepts a system category (shared, userId null)', async () => {
      const token = await signUp('a002-system@example.com');
      const accountId = await createAccount(token);
      const categories = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const systemCategory = categories.body.data.find((item: { isSystem: boolean }) => item.isSystem);

      await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Idempotency-Key', 'e2e-transaction-dto-and-category.e2e-spec-5')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'EXPENSE', accountId, categoryId: systemCategory.id, amountMinor: '100', transactionDate: '2026-08-10' })
        .expect(201);
    });
  });
});

describe('A-002 — category parity in the Prisma branch', () => {
  beforeEach(() => {
    process.env.ENABLE_PRISMA = 'true';
  });

  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  // R-009: every category row carries its `type` (Prisma `CategoryType`), which the
  // service compares against the transaction type; the fixture must model it.
  function serviceWith(category: { id: string; userId: string | null; name: string; type: 'EXPENSE' | 'INCOME'; isSystem: boolean; status: 'ACTIVE' | 'ARCHIVED' } | null) {
    const store = new InMemoryStore();
    const accounts = {
      findByIdForUser: async () => ({ id: 'bank', userId: 'user-1', name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: 500n, status: 'ACTIVE' }),
      balance: async () => 500n,
    } as unknown as PrismaAccountRepository;
    const created: Array<{ categoryId: string | null }> = [];
    const persistent = {
      findByIdempotency: async () => null,
      create: async (record: { categoryId: string | null }) => {
        created.push(record);
        return { ...record, transferDirection: undefined };
      },
    } as unknown as PrismaTransactionRepository;
    const categories = {
      findForUser: async () => category,
    } as unknown as PrismaCategoryRepository;
    return { service: new TransactionsService(store, accounts, persistent, categories), created };
  }

  const activeCategory = { id: 'cat-1', userId: 'user-1', name: 'Food', type: 'EXPENSE' as const, isSystem: false, status: 'ACTIVE' as const };

  it('rejects an archived category with 422 and writes nothing', async () => {
    const { service, created } = serviceWith({ ...activeCategory, status: 'ARCHIVED' });
    await expect(service.create('user-1', { type: 'EXPENSE', accountId: 'bank', categoryId: 'cat-1', amountMinor: '10', transactionDate: '2026-08-10' }))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(created).toHaveLength(0);
  });

  it('rejects a foreign/missing category with 404 and writes nothing', async () => {
    const { service, created } = serviceWith(null);
    await expect(service.create('user-1', { type: 'EXPENSE', accountId: 'bank', categoryId: 'cat-1', amountMinor: '10', transactionDate: '2026-08-10' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(created).toHaveLength(0);
  });

  it('allows a system category and persists its id', async () => {
    const { service, created } = serviceWith({ id: 'sys-1', userId: null, name: 'Food', type: 'EXPENSE', isSystem: true, status: 'ACTIVE' });
    await service.create('user-1', { type: 'EXPENSE', accountId: 'bank', categoryId: 'sys-1', amountMinor: '10', transactionDate: '2026-08-10' });
    expect(created).toHaveLength(1);
    expect(created[0].categoryId).toBe('sys-1');
  });
});
