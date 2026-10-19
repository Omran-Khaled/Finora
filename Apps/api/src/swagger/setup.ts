import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Mounts the OpenAPI document + Swagger UI at `/api/v1/docs`.
 *
 * Opt-in only (F-007): unless `ENABLE_SWAGGER` is exactly "true" nothing is
 * mounted, so production deployments never publish the full API surface by
 * accident. Kept in its own module so the gate can be verified by tests without
 * booting the HTTP server (see `test/security.e2e-spec.ts`).
 */
export function configureSwagger(app: INestApplication): void {
  if (process.env.ENABLE_SWAGGER !== 'true') return;

  const swaggerPort = process.env.PORT ?? '5000';
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Finora API')
    .setDescription(
      [
        'Finora is a personal finance API for managing accounts, transactions, atomic transfers, budgets, savings goals and monthly dashboards.',
        '',
        '## Base URL',
        'All endpoints are versioned under `/api/v1` (for example `GET /api/v1/accounts`).',
        '',
        '## Authentication',
        'Most endpoints require a **Bearer session token**. Obtain one by calling `POST /auth/register` or `POST /auth/login`, then use the **Authorize** button (top right) to store it. The API accepts the token either in the `Authorization: Bearer <token>` header or in the `x-session-token` header. Session tokens are opaque (they are NOT JWTs) and expire after 30 days. Endpoints that do not require a token are marked as public.',
        '',
        '## Conventions',
        '- All monetary values are **integer minor units** (e.g. cents) — never floats.',
        '- Dates use the ISO `YYYY-MM-DD` format.',
        '- Every error shares one envelope: `{ "error": { "code", "message", "requestId" } }`. The `requestId` is echoed in the `x-request-id` response header and can be sent on the request to trace it.',
        '- List endpoints return `{ "data": [...], "meta": { "nextCursor": "<id>" | null } }`. `nextCursor` is the opaque keyset cursor of the last item; pass it back as `?cursor=` to fetch the following page. It is `null` when the page is the last one.',
        '- `POST /transactions` and `POST /transfers` require an `Idempotency-Key` header: replaying the same payload with the same key returns the original resource instead of creating a duplicate; reusing a key with different financial data returns `409 DUPLICATE_REQUEST`.',
        '- Rate limits: **10 attempts/minute** for register & login, **30 attempts/minute** for refresh (per IP). Exceeding a limit returns `429` with code `RATE_LIMITED`.',
      ].join('\n\n'),
    )
    .setVersion('1.0')
    .addServer(`http://localhost:${swaggerPort}`, 'Local development server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque-session-token',
        description:
          'Opaque bearer session token issued by `/auth/register`, `/auth/login` or `/auth/refresh`. Use the Authorize dialog or send the `Authorization: Bearer <token>` header (the `x-session-token` header is also accepted).',
      },
      'bearer',
    )
    .addTag('Authentication', 'Register, sign in, sign out, refresh sessions and read the current profile. `POST /auth/register`, `POST /auth/login` and `POST /auth/refresh` are public; the rest requires a session token.')
    .addTag('Health', 'Liveness and readiness probes. Public, no authentication required.')
    .addTag('Accounts', "Manage the authenticated user's financial accounts (checking, savings, cash).")
    .addTag('Categories', 'System categories (read-only) and user-defined categories, including archiving.')
    .addTag('Transactions', 'Income and expense records, list filtering, edits and voiding.')
    .addTag('Transfers', 'Atomic movement of money between two accounts of the same user.')
    .addTag('Budgets', 'Monthly spending limits per category with live usage statistics.')
    .addTag('Savings Goals', 'Target-based savings goals backed by a dedicated SAVINGS account.')
    .addTag('Dashboard', 'Monthly financial summary across accounts.')
    .addGlobalParameters({
      name: 'x-request-id',
      required: false,
      in: 'header',
      description: 'Optional client-generated request identifier. It is echoed back in the `x-request-id` response header and included in error envelopes for tracing.',
      schema: { type: 'string', example: 'req_6d5f1c2e-4a3b-4c5d-8e7f-9a0b1c2d3e4f' },
    })
    .build();

  SwaggerModule.setup(
    'api/v1/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    {
      customSiteTitle: 'Finora API Lab',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
        docExpansion: 'list',
      },
      customCss: `
      :root {
        --finora-ink: #102a2a;
        --finora-teal: #176b61;
        --finora-mint: #dff5ed;
      }
      body {
        background: linear-gradient(135deg, #f5fbf8 0%, #eef7f4 55%, #e9f2ef 100%);
      }
      .swagger-ui .topbar {
        background: var(--finora-ink);
        border-bottom: 4px solid #63c7a8;
      }
      .swagger-ui .topbar .download-url-wrapper .select-label,
      .swagger-ui .topbar .download-url-wrapper input {
        color: white;
      }
      .swagger-ui .info .title {
        color: var(--finora-ink);
        font-size: 34px;
        letter-spacing: -0.03em;
      }
      .swagger-ui .info .title small {
        background: var(--finora-teal);
      }
      .swagger-ui .opblock {
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(16, 42, 42, 0.06);
        overflow: hidden;
      }
      .swagger-ui .opblock .opblock-summary {
        padding: 12px 16px;
      }
      .swagger-ui .btn.execute {
        background: var(--finora-teal);
        border-color: var(--finora-teal);
      }
      .swagger-ui .btn.execute:hover {
        background: #0f5149;
      }
      @media (prefers-color-scheme: dark) {
        body {
          background: #0b1718;
        }
        .swagger-ui,
        .swagger-ui .info .title,
        .swagger-ui .info p,
        .swagger-ui .opblock-tag,
        .swagger-ui table thead tr th,
        .swagger-ui .parameter__name,
        .swagger-ui .parameter__type,
        .swagger-ui label,
        .swagger-ui .response-col_status,
        .swagger-ui .response-col_description {
          color: #e4f2ee;
        }
        .swagger-ui .scheme-container,
        .swagger-ui .opblock,
        .swagger-ui section.models {
          background: #122526;
          border-color: #294746;
        }
        .swagger-ui .opblock-description-wrapper p,
        .swagger-ui .renderedMarkdown p,
        .swagger-ui .markdown p {
          color: #b2cbc4;
        }
        .swagger-ui select,
        .swagger-ui input,
        .swagger-ui textarea {
          background: #0b1718;
          color: #e4f2ee;
          border-color: #3b5c59;
        }
        .swagger-ui .microlight,
        .swagger-ui .highlight-code {
          background: #081112 !important;
          color: #c9eee2;
        }
      }
    `,
    },
  );
}
