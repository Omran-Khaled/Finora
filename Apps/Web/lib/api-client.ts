// API client — the single place features talk to the "backend".
//
//   Feature  →  api (this file)  →  Mock adapter  |  Real HTTP adapter
//
// Features must never import mock internals, localStorage, or raw fetch.
// Set NEXT_PUBLIC_API_MODE explicitly to "mock" for development/test or "real"
// with NEXT_PUBLIC_API_BASE_URL for the HTTP adapter. Next inlines public values
// at build time; production requires a real mode and valid URL before building.

import { mockApi } from './mock-adapter';
import { httpApi } from './http-adapter';
import { resolveWebApiConfig } from './api-config';
import { FinancialIntentKeyManager } from './idempotency';
import { loadSessionUser } from './session-store';

const nodeEnvironment = process.env.NODE_ENV;
const environment =
  nodeEnvironment === 'production' ? 'production' : nodeEnvironment === 'test' ? 'test' : 'development';
const apiConfig = resolveWebApiConfig(
  process.env.NEXT_PUBLIC_API_MODE,
  process.env.NEXT_PUBLIC_API_BASE_URL,
  environment,
);

const adapter = apiConfig.useRealApi ? httpApi : mockApi;
const transactionIntentKeys = new FinancialIntentKeyManager();
const transferIntentKeys = new FinancialIntentKeyManager();
const financialIntentScope = (): string => loadSessionUser()?.id ?? 'anonymous';

export const api = {
  ...adapter,
  transactions: {
    ...adapter.transactions,
    create: (request: Parameters<typeof adapter.transactions.create>[0]) =>
      transactionIntentKeys.execute(
        financialIntentScope(),
        request,
        (key) => adapter.transactions.create(request, key),
      ),
  },
  transfers: {
    ...adapter.transfers,
    create: (request: Parameters<typeof adapter.transfers.create>[0]) =>
      transferIntentKeys.execute(
        financialIntentScope(),
        request,
        (key) => adapter.transfers.create(request, key),
      ),
  },
};

export type ApiClient = typeof api;
