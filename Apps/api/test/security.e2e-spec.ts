import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';
import { configureSwagger } from '../src/swagger/setup';

async function createApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  return app;
}

describe('S-001 — Swagger is gated on ENABLE_SWAGGER', () => {
  afterEach(() => {
    delete process.env.ENABLE_SWAGGER;
  });

  it('does not mount /docs when ENABLE_SWAGGER is unset', async () => {
    delete process.env.ENABLE_SWAGGER;
    const app = await createApp();
    configureSwagger(app);
    await app.init();

    await request(app.getHttpServer()).get('/api/v1/docs').expect(404);
    await request(app.getHttpServer()).get('/api/v1/docs-json').expect(404);
    await app.close();
  });

  it('does not mount /docs when ENABLE_SWAGGER=false', async () => {
    process.env.ENABLE_SWAGGER = 'false';
    const app = await createApp();
    configureSwagger(app);
    await app.init();

    await request(app.getHttpServer()).get('/api/v1/docs').expect(404);
    await app.close();
  });

  it('mounts /docs when ENABLE_SWAGGER=true', async () => {
    process.env.ENABLE_SWAGGER = 'true';
    const app = await createApp();
    configureSwagger(app);
    await app.init();

    await request(app.getHttpServer()).get('/api/v1/docs').expect(200);
    await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    await app.close();
  });
});

describe('S-002 — auth rate limit returns 429', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.ENABLE_SWAGGER = 'false';
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.ENABLE_SWAGGER;
  });

  it('throttles the 11th registration from the same IP with 429 + preserved envelope', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `burst-${attempt}@example.com`, password: 'correct horse battery staple', baseCurrency: 'USD' })
        .expect(201);
    }

    const throttled = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'burst-11@example.com', password: 'correct horse battery staple', baseCurrency: 'USD' })
      .expect(429);

    expect(throttled.body.error.code).toBe('RATE_LIMITED');
    expect(throttled.body.error.message).toBe('Too many authentication attempts. Please try again later.');
    expect(throttled.body.error.requestId).toMatch(/^req_/);
  });
});
