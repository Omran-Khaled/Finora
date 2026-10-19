import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';
import { DEFAULT_PAGE_SIZE } from '../src/core/pagination';

// P-001: every list endpoint must serve a bounded page and hand out a real
// `meta.nextCursor` that chains to the end of the collection without gaps or
// duplicates. This suite drives the in-memory path end-to-end over HTTP.
describe('P-001 — server cursor pagination', () => {
  let app: INestApplication;
  let token: string;
  let bankId: string;
  const createdTransactionIds: string[] = [];

  const authorized = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'pagination@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    token = registration.body.data.token;

    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(authorized())
      .send({ name: 'Pagination bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '0' })
      .expect(201);
    bankId = account.body.data.id;

    // 45 rows: more than two default pages (20) but fewer than the hard cap (100).
    // NOTE: each row uses a unique Idempotency-Key — reusing one key with
    // different payloads must be rejected as DUPLICATE_REQUEST per invariant 7.
    for (let index = 0; index < 45; index += 1) {
      const day = String((index % 28) + 1).padStart(2, '0');
      const month = String(Math.floor(index / 28) + 1).padStart(2, '0');
      const created = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Idempotency-Key', `e2e-transaction-pagination-${index}`)
        .set(authorized())
        .send({ type: 'INCOME', accountId: bankId, amountMinor: '100' + index, transactionDate: `2026-${month}-${day}` })
        .expect(201);
      createdTransactionIds.push(created.body.data.id);
    }
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('walks 45 transactions in bounded pages without gaps or duplicates', async () => {
    const collected: string[] = [];
    let cursor: string | undefined;
    let pages = 0;

    while (pages < 5) {
      const url: string = cursor
        ? `/api/v1/transactions?limit=${DEFAULT_PAGE_SIZE}&cursor=${cursor}`
        : `/api/v1/transactions?limit=${DEFAULT_PAGE_SIZE}`;
      const page: request.Response = await request(app.getHttpServer()).get(url).set(authorized()).expect(200);

      expect(page.body.data.length).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);
      collected.push(...page.body.data.map((item: { id: string }) => item.id));
      cursor = page.body.meta.nextCursor ?? undefined;
      pages += 1;
      if (!cursor) break;
    }

    expect(collected).toHaveLength(45);
    expect(new Set(collected).size).toBe(45);
    expect(collected.sort()).toEqual([...createdTransactionIds].sort());
  }, 60000);

  it('applies the documented default page size when limit is omitted', async () => {
    const page = await request(app.getHttpServer()).get('/api/v1/transactions').set(authorized()).expect(200);
    expect(page.body.data).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(page.body.meta.nextCursor).not.toBeNull();
  });

  it('pages accounts with a real nextCursor', async () => {
    for (const name of ['Second', 'Third']) {
      await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set(authorized())
        .send({ name, type: 'CASH', currencyCode: 'USD', openingBalanceMinor: '0' })
        .expect(201);
    }

    const first = await request(app.getHttpServer()).get('/api/v1/accounts?limit=2').set(authorized()).expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.nextCursor).toBe(first.body.data[1].id);

    const second = await request(app.getHttpServer())
      .get(`/api/v1/accounts?limit=2&cursor=${first.body.meta.nextCursor}`)
      .set(authorized())
      .expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.nextCursor).toBeNull();
  });

  it('pages budgets and savings goals with the same envelope', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(authorized())
      .send({ name: 'Pagination category', type: 'EXPENSE' })
      .expect(201);

    for (const month of [1, 2, 3]) {
      await request(app.getHttpServer())
        .post('/api/v1/budgets')
        .set(authorized())
        .send({ categoryId: category.body.data.id, year: 2026, month, limitMinor: '1000' })
        .expect(201);
    }

    const savings = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(authorized())
      .send({ name: 'Pagination savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/savings-goals')
      .set(authorized())
      .send({ accountId: savings.body.data.id, name: 'Pagination goal', targetAmountMinor: '1000' })
      .expect(201);

    const budgets = await request(app.getHttpServer()).get('/api/v1/budgets?limit=2').set(authorized()).expect(200);
    expect(budgets.body.data).toHaveLength(2);
    expect(budgets.body.meta.nextCursor).toBe(budgets.body.data[1].id);

    const goals = await request(app.getHttpServer()).get('/api/v1/savings-goals?limit=1').set(authorized()).expect(200);
    expect(goals.body.data).toHaveLength(1);
    expect(goals.body.meta.nextCursor).toBeNull();
  });

  it('rejects an out-of-range limit instead of silently clamping it', async () => {
    await request(app.getHttpServer()).get('/api/v1/transactions?limit=101').set(authorized()).expect(400);
    await request(app.getHttpServer()).get('/api/v1/transactions?limit=0').set(authorized()).expect(400);
  });

  it('ends the sequence when a stale cursor is replayed', async () => {
    const page = await request(app.getHttpServer())
      .get('/api/v1/transactions?limit=20&cursor=00000000-0000-4000-8000-000000000000')
      .set(authorized())
      .expect(200);
    expect(page.body.data).toEqual([]);
    expect(page.body.meta.nextCursor).toBeNull();
  });
});
