import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';

describe('C-001 — transfer void / leg-edit parity', () => {
  let app: INestApplication;
  let token: string;
  let sourceId: string;
  let destinationId: string;
  let transferId: string;
  let transferLegId: string;

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
      .send({ email: 'c001@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    token = registration.body.data.token;

    const source = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(authorized())
      .send({ name: 'Source', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100000' })
      .expect(201);
    sourceId = source.body.data.id;

    const destination = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set(authorized())
      .send({ name: 'Destination', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' })
      .expect(201);
    destinationId = destination.body.data.id;

    const transfer = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Idempotency-Key', 'e2e-transfer-void-and-bounds.e2e-spec-1')
      .set(authorized())
      .send({ fromAccountId: sourceId, toAccountId: destinationId, amountMinor: '25000', transactionDate: '2026-08-20' })
      .expect(201);
    // POST /transfers returns the canonical nested envelope ({ transfer, sourceTx, destinationTx }).
    transferId = transfer.body.data.transfer.id;
    transferLegId = transfer.body.data.sourceTx.id;
  });

  afterAll(async () => app.close());

  it('refuses to PATCH an individual transfer leg', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${transferLegId}`)
      .set(authorized())
      .send({ description: 'sneaky edit' })
      .expect(422);
    expect(response.body.error.code).toBe('INVALID_TRANSFER');
  });

  it('still accepts an idempotent transfer replay before voiding', async () => {
    const replay = await request(app.getHttpServer()).get(`/api/v1/transfers/${transferId}`).set(authorized()).expect(200);
    expect(replay.body.data.transfer.id).toBe(transferId);
  });

  it('voids the transfer once, reversing both leg balances', async () => {
    await request(app.getHttpServer()).post(`/api/v1/transfers/${transferId}/void`).set(authorized()).expect(201);
    const source = await request(app.getHttpServer()).get(`/api/v1/accounts/${sourceId}`).set(authorized()).expect(200);
    const destination = await request(app.getHttpServer()).get(`/api/v1/accounts/${destinationId}`).set(authorized()).expect(200);
    expect(source.body.data.balanceMinor).toBe('100000');
    expect(destination.body.data.balanceMinor).toBe('0');
  });

  it('rejects a second void with 422 TRANSACTION_ALREADY_VOIDED', async () => {
    const response = await request(app.getHttpServer()).post(`/api/v1/transfers/${transferId}/void`).set(authorized()).expect(422);
    expect(response.body.error.code).toBe('TRANSACTION_ALREADY_VOIDED');
  });
});

describe('Q-001 — exact decimal-string minor amounts preserve BIGINT precision', () => {
  let app: INestApplication;
  let token: string;
  let accountId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'q001@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    token = registration.body.data.token;
    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: 'Overflow', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '1000' })
      .expect(201);
    accountId = account.body.data.id;
  });

  afterAll(async () => app.close());

  it('accepts an exact decimal string above JavaScript safe-integer range', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Idempotency-Key', 'e2e-transaction-void-and-bounds.e2e-spec-2')
      .set({ Authorization: `Bearer ${token}` })
      .send({ type: 'INCOME', accountId, amountMinor: '1152921504606846976', transactionDate: '2026-08-10' })
      .expect(201);
    expect(response.body.data.amountMinor).toBe('1152921504606846976');
    const list = await request(app.getHttpServer()).get('/api/v1/transactions').set({ Authorization: `Bearer ${token}` });
    expect(list.body.data).toHaveLength(1);
  });

  it('rejects the same unsafe numeric input', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('Idempotency-Key', 'e2e-transaction-void-and-bounds.e2e-spec-3')
      .set({ Authorization: `Bearer ${token}` })
      .send({ type: 'INCOME', accountId, amountMinor: 1152921504606846976, transactionDate: '2026-08-11' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const list = await request(app.getHttpServer()).get('/api/v1/transactions').set({ Authorization: `Bearer ${token}` });
    expect(list.body.data).toHaveLength(1);
  });
});
