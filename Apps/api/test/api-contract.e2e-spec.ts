import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';

describe('API contract', () => {
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

  it('returns the canonical health shape and request id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({ data: { status: 'ok' } });
    expect(response.headers['x-request-id']).toMatch(/^req_/);
  });

  it('rejects protected access with the canonical error envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/accounts').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('registers, authenticates, and hides password data from me', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'contract@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    const token = registration.body.data.token;
    expect(token).toEqual(expect.any(String));

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.data.email).toBe('contract@example.com');
    expect(me.body.data.passwordHash).toBeUndefined();
  });

  // R-009: login/logout/refresh are declared as `@ApiOkResponse` (200) in the
  // Swagger contract; pin the executed status codes so the running API cannot
  // drift back to Nest's POST default of 201 for these endpoints.
  it('returns the documented 200 from login, logout, and refresh', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'auth-status@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    expect(registration.body.data.token).toEqual(expect.any(String));

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'auth-status@example.com', password: 'correct horse battery staple' })
      .expect(200);
    const sessionToken = login.body.data.token as string;
    expect(sessionToken).toEqual(expect.any(String));

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200);
    const rotated = refresh.body.data.token as string;
    expect(rotated).toEqual(expect.any(String));

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotated}`)
      .expect(200);
    expect(logout.body).toEqual({ data: {} });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rotated}`)
      .expect(401);
  });

  it('updates the authenticated user base currency via the profile route', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'profile@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registration.body.data.token}`)
      .send({ baseCurrency: 'SAR' })
      .expect(200);

    expect(updated.body.data.baseCurrency).toBe('SAR');
  });

  it('locks base currency after account creation and enforces it for accounts', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'currency-lock@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    const token = registration.body.data.token;

    await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'USD account', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' })
      .expect(201);

    const currencyUpdate = await request(app.getHttpServer())
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ baseCurrency: 'EUR' })
      .expect(409);
    expect(currencyUpdate.body.error.code).toBe('BASE_CURRENCY_LOCKED');

    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'EUR account', type: 'BANK', currencyCode: 'EUR', openingBalanceMinor: '100' })
      .expect(422);
    expect(account.body.error.code).toBe('BASE_CURRENCY_MISMATCH');
  });

  it('keeps another user from reading an owned account', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'owner@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' });
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'other@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' });
    const account = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${first.body.data.token}`)
      .send({ name: 'Private account', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '1000' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/accounts/${account.body.data.id}`)
      .set('Authorization', `Bearer ${second.body.data.token}`)
      .expect(404);
  });
});
