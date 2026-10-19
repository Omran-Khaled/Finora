// Pagination boundary (P-002): reference collections serve bounded pages
// through meta.nextCursor; the dashboard query boundary rejects non-integer
// and out-of-range year/month pairs without reaching monthWindow().
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';
import { MAX_PAGE_SIZE } from '../src/core/pagination';
import { monthWindow } from '../src/core/period';

describe('pagination boundary', () => {
  let app: INestApplication;
  let token: string;
  let categoryId: string;
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
      .send({ email: 'pagination-boundary@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(201);
    token = registration.body.data.token;
    const category = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(authorized())
      .send({ name: 'Boundary category', type: 'EXPENSE' })
      .expect(201);
    categoryId = category.body.data.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('serves exact-boundary pages and real cursors for budgets', async () => {
    for (const month of [1, 2, 3]) {
      await request(app.getHttpServer())
        .post('/api/v1/budgets')
        .set(authorized())
        .send({ categoryId, year: 2026, month, limitMinor: '1000' })
        .expect(201);
    }
    const categories = await request(app.getHttpServer()).get('/api/v1/categories?limit=100').set(authorized()).expect(200);
    const total = categories.body.data.length;
    expect(total).toBeGreaterThan(0);
    const exact = await request(app.getHttpServer()).get(`/api/v1/categories?limit=${total}`).set(authorized()).expect(200);
    expect(exact.body.data).toHaveLength(total);
    expect(exact.body.meta.nextCursor).toBeNull();
    const first = await request(app.getHttpServer()).get('/api/v1/budgets?limit=2').set(authorized()).expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.nextCursor).toBe(first.body.data[1].id);
    const second = await request(app.getHttpServer())
      .get(`/api/v1/budgets?limit=2&cursor=${first.body.meta.nextCursor}`)
      .set(authorized())
      .expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.nextCursor).toBeNull();
    expect(MAX_PAGE_SIZE).toBe(100);
  });

  it('ends on a stale cursor', async () => {
    const stale = await request(app.getHttpServer())
      .get('/api/v1/budgets?limit=20&cursor=00000000-0000-4000-8000-000000000000')
      .set(authorized())
      .expect(200);
    expect(stale.body.data).toEqual([]);
    expect(stale.body.meta.nextCursor).toBeNull();
  });

  it('rejects invalid dashboard year/month and preserves defaults', async () => {
    const now = new Date();
    const summary = await request(app.getHttpServer()).get('/api/v1/dashboard/summary').set(authorized()).expect(200);
    expect(summary.body.data.period).toEqual({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
    for (const month of [1, 12]) {
      const bounded = await request(app.getHttpServer())
        .get(`/api/v1/dashboard/summary?year=2026&month=${month}`)
        .set(authorized())
        .expect(200);
      expect(bounded.body.data.period).toEqual({ year: 2026, month });
    }
    await request(app.getHttpServer()).get('/api/v1/dashboard/summary?year=abc').set(authorized()).expect(400);
    await request(app.getHttpServer()).get('/api/v1/dashboard/summary?month=1.5').set(authorized()).expect(400);
    await request(app.getHttpServer()).get('/api/v1/dashboard/summary?month=0').set(authorized()).expect(400);
    await request(app.getHttpServer()).get('/api/v1/dashboard/summary?month=13').set(authorized()).expect(400);
    // Empty query values are treated as omitted: defaults preserved, and the
    // resolved period always maps to a real calendar window.
    const emptyValue = await request(app.getHttpServer()).get('/api/v1/dashboard/summary?year=&month=').set(authorized()).expect(200);
    expect(emptyValue.body.data.period).toEqual({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
    expect(monthWindow(emptyValue.body.data.period.year, emptyValue.body.data.period.month).from).toMatch(/^\d{4}-\d{2}-01$/);
    const yearOnly = await request(app.getHttpServer()).get('/api/v1/dashboard/summary?year=2026').set(authorized()).expect(200);
    expect(yearOnly.body.data.period.year).toBe(2026);
    expect(yearOnly.body.data.period.month).toBe(now.getUTCMonth() + 1);
  });
});
