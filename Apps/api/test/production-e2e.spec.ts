import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';

const describeProduction = process.env.DATABASE_URL ? describe : describe.skip;

describeProduction('Production persistence gate — PostgreSQL-backed critical invariants', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    process.env.ENABLE_PRISMA = 'true';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `production-gate-${Date.now()}@example.com`,
        password: 'correct horse battery staple',
        baseCurrency: 'USD',
      })
      .expect(201);
    token = registration.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
    delete process.env.ENABLE_PRISMA;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('enforces base-currency authority, required idempotency, and fingerprint semantics', async () => {
    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(auth())
      .send({ name: 'Primary', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '10000' })
      .expect(201);

    const accountId = account.body.data.id as string;

    await request(app.getHttpServer())
      .patch('/api/v1/auth/me')
      .set(auth())
      .send({ baseCurrency: 'EUR' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(auth())
      .send({ name: 'Wrong Currency', type: 'BANK', currencyCode: 'EUR', openingBalanceMinor: '0' })
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(auth())
      .send({ type: 'INCOME', accountId, amountMinor: '100', transactionDate: '2026-09-27' })
      .expect(400);

    const key = `production-idempotency-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(auth())
      .set('Idempotency-Key', key)
      .send({ type: 'INCOME', accountId, amountMinor: '100', transactionDate: '2026-09-27' })
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(auth())
      .set('Idempotency-Key', key)
      .send({ type: 'INCOME', accountId, amountMinor: '100', transactionDate: '2026-09-27' })
      .expect(201);

    expect(replay.body.data.id).toBe(first.body.data.id);

    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(auth())
      .set('Idempotency-Key', key)
      .send({ type: 'INCOME', accountId, amountMinor: '101', transactionDate: '2026-09-27' })
      .expect(409);
  });

  it('replays one concurrent identical expense request instead of rejecting it for insufficient funds', async () => {
    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(auth())
      .send({ name: 'Replay Expense', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' })
      .expect(201);
    const accountId = account.body.data.id as string;
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth())
      .send({ name: `Replay Expense ${Date.now()}`, type: 'EXPENSE' })
      .expect(201);

    const key = `production-concurrent-expense-replay-${Date.now()}`;
    const submit = () => request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(auth())
      .set('Idempotency-Key', key)
      .send({ type: 'EXPENSE', accountId, categoryId: category.body.data.id, amountMinor: '100', description: 'Concurrent replay', transactionDate: '2026-09-28' });

    // Exactly enough funds for one write: the second in-flight request must return
    // the original transaction, not the balance the first one consumed.
    const responses = await Promise.all([submit(), submit()]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.data.id).toBe(responses[1].body.data.id);

    const balance = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set(auth())
      .expect(200);
    expect(balance.body.data.balanceMinor).toBe('0');
  });

  it('replays one concurrent identical transfer request instead of rejecting it for insufficient funds', async () => {
    const source = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(auth())
      .send({ name: 'Replay Transfer Source', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' })
      .expect(201);
    const destination = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(auth())
      .send({ name: 'Replay Transfer Destination', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' })
      .expect(201);

    const sourceId = source.body.data.id as string;
    const destinationId = destination.body.data.id as string;
    const key = `production-concurrent-transfer-replay-${Date.now()}`;
    const submit = () => request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set(auth())
      .set('Idempotency-Key', key)
      .send({ fromAccountId: sourceId, toAccountId: destinationId, amountMinor: '100', transactionDate: '2026-09-28' });

    const responses = await Promise.all([submit(), submit()]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.data.transfer.id).toBe(responses[1].body.data.transfer.id);

    const sourceBalance = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${sourceId}`)
      .set(auth())
      .expect(200);
    const destinationBalance = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${destinationId}`)
      .set(auth())
      .expect(200);
    expect(sourceBalance.body.data.balanceMinor).toBe('0');
    expect(destinationBalance.body.data.balanceMinor).toBe('100');
  });

  it('prevents concurrent overspending on the same account', async () => {
    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(auth())
      .send({ name: 'Concurrency', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' })
      .expect(201);
    const accountId = account.body.data.id as string;
    // BR-003: an EXPENSE payload without a category is rejected with
    // VALIDATION_ERROR before the funds guard runs, so the concurrency
    // scenario needs a real EXPENSE category to exercise INSUFFICIENT_FUNDS.
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(auth())
      .send({ name: `Concurrency ${Date.now()}`, type: 'EXPENSE' })
      .expect(201);

    const requests = [1, 2].map((i) => request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(auth())
      .set('Idempotency-Key', `production-concurrency-${Date.now()}-${i}`)
      .send({ type: 'EXPENSE', accountId, categoryId: category.body.data.id, amountMinor: '80', description: 'Concurrent expense', transactionDate: '2026-09-27' }));

    const responses = await Promise.all(requests);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 422 && r.body?.error?.code === 'INSUFFICIENT_FUNDS')).toHaveLength(1);
  });


  it('keeps transfers atomic under concurrent writes and revokes the session on logout', async () => {
    const logoutRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `production-logout-${Date.now()}@example.com`,
        password: 'correct horse battery staple',
        baseCurrency: 'USD',
      })
      .expect(201);
    const logoutToken = logoutRegistration.body.data.token as string;
    const logoutAuth = () => ({ Authorization: `Bearer ${logoutToken}` });

    expect(logoutToken).not.toBe(token);

    const source = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(logoutAuth())
      .send({ name: 'Transfer Source', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' })
      .expect(201);
    const destination = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(logoutAuth())
      .send({ name: 'Transfer Destination', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' })
      .expect(201);

    const sourceId = source.body.data.id as string;
    const destinationId = destination.body.data.id as string;
    const stamp = Date.now();

    const responses = await Promise.all(
      [1, 2].map((i) =>
        request(app.getHttpServer())
          .post('/api/v1/transfers')
          .set(logoutAuth())
          .set('Idempotency-Key', `production-transfer-${stamp}-${i}`)
          .send({
            fromAccountId: sourceId,
            toAccountId: destinationId,
            amountMinor: '80',
            transactionDate: '2026-09-27',
          }),
      ),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 422 && r.body?.error?.code === 'INSUFFICIENT_FUNDS')).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set(logoutAuth())
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(logoutAuth())
      .expect(401);
  });

  it('rotates a refresh token atomically and rejects replay of the old token', async () => {
    const currentToken = token;
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Authorization', `Bearer ${currentToken}`),
      request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Authorization', `Bearer ${currentToken}`),
    ]);

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 401)).toHaveLength(1);

    const rotated = responses.find((r) => r.status === 200)!.body.data.token as string;
    expect(rotated).toBeTruthy();
    token = rotated;

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(auth())
      .expect(200);
  });
});
