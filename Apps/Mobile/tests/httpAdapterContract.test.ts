/**
 * T-002 — real-adapter contract tests (Mobile).
 *
 * The mobile `HttpAdapter` is the production path for real mode; these tests pin
 * the paths/headers it emits so a server-side rename or a casing change in the
 * `Idempotency-Key` header cannot silently break financial writes.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { createApiError } from '../lib/api/errors';
import type { HttpAdapter } from '../lib/api/httpAdapter';

const API_URL = 'https://api.test.local';

type FetchArgs = [string, { method?: string; headers?: Record<string, string>; body?: string }];

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('mobile http adapter — request contract (T-002)', () => {
  let adapter: HttpAdapter;
  let fetchMock: jest.Mock<typeof fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_URL = API_URL;
    // Loaded after the env var is set: the adapter resolves its base URL at import time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require('../lib/api/httpAdapter') as { HttpAdapter: new () => HttpAdapter };
    adapter = new loaded.HttpAdapter();
    adapter.setToken('token-1');
    fetchMock = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] })) as unknown as jest.Mock<typeof fetch>;
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    jest.restoreAllMocks();
  });

  const calls = () => fetchMock.mock.calls as unknown as FetchArgs[];

  it('prefixes the versioned base path and sends the bearer token', async () => {
    await adapter.getAccounts('u1');

    // The reference getters walk bounded pages, so the versioned path carries the
    // page query; the versioned base path itself must never change.
    expect(calls()[0]?.[0]).toBe(API_URL + '/api/v1/accounts?limit=100');
    expect(calls()[0]?.[1]?.headers?.Authorization).toBe('Bearer token-1');
  });

  it('sends Idempotency-Key with the exact server casing on POST /transactions', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));
    await adapter.createTransaction(
      'u1',
      { type: 'INCOME', accountId: 'acc-1', amountMinor: '500', transactionDate: '2026-09-01' },
      'key-abc',
    );

    const [url, init] = calls()[0]!;
    expect(url).toBe(API_URL + '/api/v1/transactions');
    expect(init.method).toBe('POST');
    expect(init.headers?.['Idempotency-Key']).toBe('key-abc');
    // A different casing would be a different header — assert absence explicitly.
    expect(init.headers?.['idempotency-key']).toBeUndefined();
    expect(JSON.parse(String(init.body))).toMatchObject({ accountId: 'acc-1', amountMinor: '500' });
  });

  it('sends Idempotency-Key on POST /transfers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));
    await adapter.createTransfer(
      'u1',
      { fromAccountId: 'acc-1', toAccountId: 'acc-2', amountMinor: '500', transactionDate: '2026-09-01' },
      'key-transfer',
    );

    const [url, init] = calls()[0]!;
    expect(url).toBe(API_URL + '/api/v1/transfers');
    expect(init.headers?.['Idempotency-Key']).toBe('key-transfer');
  });

  it('surfaces the API duplicate-request envelope when a key is reused with changed transfer data', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: {} }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'The idempotency key cannot be reused with different financial data.',
          requestId: 'req_duplicate',
        },
      }, 409));

    await adapter.createTransfer(
      'u1',
      { fromAccountId: 'acc-1', toAccountId: 'acc-2', amountMinor: '500', transactionDate: '2026-09-01' },
      'key-transfer',
    );

    await expect(adapter.createTransfer(
      'u1',
      { fromAccountId: 'acc-1', toAccountId: 'acc-2', amountMinor: '600', transactionDate: '2026-09-01' },
      'key-transfer',
    )).rejects.toMatchObject({
      error: { code: 'DUPLICATE_REQUEST', requestId: 'req_duplicate' },
    });
  });

  it('always sends Idempotency-Key for financial writes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));
    await adapter.createTransaction('u1', {
      type: 'INCOME',
      accountId: 'acc-1',
      amountMinor: '500',
      transactionDate: '2026-09-01',
    }, 'key-required');

    expect(calls()[0]?.[1]?.headers?.['Idempotency-Key']).toBe('key-required');
  });

  it.each(['DELETE', 'PUT', 'PATCH'] as const)(
    'does not retry a %s request after a network failure even when retry is enabled',
    async (method) => {
      const fetchFailure = createApiError('NETWORK_ERROR', 'Connection lost.');
      fetchMock
        .mockRejectedValueOnce(fetchFailure)
        .mockResolvedValueOnce(jsonResponse({ data: {} }));

      type RequestForTest = {
        request<T>(
          path: string,
          options: { method: 'DELETE' | 'PUT' | 'PATCH'; retryOnNetworkError: boolean },
        ): Promise<T>;
      };
      const request = (adapter as unknown as RequestForTest).request.bind(adapter);

      await expect(request('/test', { method, retryOnNetworkError: true })).rejects.toMatchObject({
        error: { code: 'NETWORK_ERROR' },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('retries a GET once after a fetch transport rejection', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    type RequestForTest = {
      request<T>(
        path: string,
        options: { method: 'GET'; retryOnNetworkError: boolean },
      ): Promise<T>;
    };
    const request = (adapter as unknown as RequestForTest).request.bind(adapter);

    await expect(request('/test', { method: 'GET', retryOnNetworkError: true })).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('classifies a timed-out safe GET as a network error and retries it once', async () => {
    jest.useFakeTimers();
    try {
      fetchMock
        .mockImplementationOnce(async (_input, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const timeoutError = new Error('The operation was aborted.');
            timeoutError.name = 'AbortError';
            reject(timeoutError);
          }, { once: true });
        }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      type RequestForTest = {
        request<T>(
          path: string,
          options: { method: 'GET'; retryOnNetworkError: boolean },
        ): Promise<T>;
      };
      const request = (adapter as unknown as RequestForTest).request.bind(adapter);
      const response = request('/test', { method: 'GET', retryOnNetworkError: true });

      await jest.advanceTimersByTimeAsync(15000);
      await expect(response).resolves.toEqual({ data: [] });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('classifies a timed-out safe HEAD as a network error and retries it once', async () => {
    jest.useFakeTimers();
    try {
      fetchMock
        .mockImplementationOnce(async (_input, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const timeoutError = new Error('The operation was aborted.');
            timeoutError.name = 'AbortError';
            reject(timeoutError);
          }, { once: true });
        }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      type RequestForTest = {
        request<T>(
          path: string,
          options: { method: 'HEAD'; retryOnNetworkError: boolean },
        ): Promise<T>;
      };
      const request = (adapter as unknown as RequestForTest).request.bind(adapter);
      const response = request('/test', { method: 'HEAD', retryOnNetworkError: true });

      await jest.advanceTimersByTimeAsync(15000);
      await expect(response).resolves.toEqual({ data: [] });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(calls().map(([, init]) => init.method)).toEqual(['HEAD', 'HEAD']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not exceed one retry when a GET transport failure persists', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    type RequestForTest = {
      request<T>(
        path: string,
        options: { method: 'GET'; retryOnNetworkError: boolean },
      ): Promise<T>;
    };
    const request = (adapter as unknown as RequestForTest).request.bind(adapter);

    await expect(request('/test', { method: 'GET', retryOnNetworkError: true })).rejects.toMatchObject({
      error: { code: 'NETWORK_ERROR' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves the numeric HTTP status when a retryable GET receives an HTTP error', async () => {
    const unavailable = {
      error: { code: 'NETWORK_ERROR', message: 'Temporarily unavailable.', requestId: 'req_unavailable' },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(unavailable, 503))
      .mockResolvedValueOnce(jsonResponse(unavailable, 503));

    type RequestForTest = {
      request<T>(
        path: string,
        options: { method: 'GET'; retryOnNetworkError: boolean },
      ): Promise<T>;
    };
    const request = (adapter as unknown as RequestForTest).request.bind(adapter);

    await expect(request('/test', { method: 'GET', retryOnNetworkError: true })).rejects.toMatchObject({
      status: 503,
      error: { code: 'NETWORK_ERROR' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['POST', 'PUT'] as const)(
    'does not retry a %s request after an actual fetch transport rejection',
    async (method) => {
      const fetchFailure = new TypeError('Failed to fetch');
      fetchMock.mockRejectedValueOnce(fetchFailure);

      type RequestForTest = {
        request<T>(
          path: string,
          options: { method: 'POST' | 'PUT'; retryOnNetworkError: boolean },
        ): Promise<T>;
      };
      const request = (adapter as unknown as RequestForTest).request.bind(adapter);

      await expect(request('/test', { method, retryOnNetworkError: true })).rejects.toBe(fetchFailure);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('mirrors the server list contract, including cursor and limit (P-001)', async () => {
    await adapter.getTransactions('u1', {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      from: '2026-08-01',
      to: '2026-08-31',
      cursor: 'tx-20',
      limit: 20,
    });

    const url = calls()[0]?.[0] ?? '';
    for (const fragment of ['accountId=acc-1', 'categoryId=cat-1', 'type=EXPENSE', 'from=2026-08-01', 'to=2026-08-31', 'cursor=tx-20', 'limit=20']) {
      expect(url).toContain(fragment);
    }
  });

  it('targets only routes the server actually exposes (X-001a)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));

    await adapter.updateAccount('u1', 'acc-1', { name: 'Updated account' });
    await adapter.archiveAccount('u1', 'acc-1');
    await adapter.deleteCategory('u1', 'cat-1');
    await adapter.voidTransaction('u1', 'tx-1');
    await adapter.deleteBudget('u1', 'bud-1');
    await adapter.archiveSavingsGoal('u1', 'goal-1');
    await adapter.getDashboardSummary('u1');

    expect(calls()[0]?.[0]).toBe(API_URL + '/api/v1/accounts/acc-1');
    expect(calls()[0]?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(calls()[0]?.[1]?.body ?? '{}')).toEqual({ name: 'Updated account' });
    expect(calls()[1]?.[0]).toBe(API_URL + '/api/v1/accounts/acc-1/archive');
    expect(calls()[1]?.[1]?.method).toBe('POST');
    // The server has no `DELETE /categories/:id`; archiving is the only removal.
    expect(calls()[2]?.[0]).toBe(API_URL + '/api/v1/categories/cat-1/archive');
    expect(calls()[2]?.[1]?.method).toBe('POST');
    expect(calls()[3]?.[0]).toBe(API_URL + '/api/v1/transactions/tx-1/void');
    expect(calls()[4]?.[0]).toBe(API_URL + '/api/v1/budgets/bud-1');
    expect(calls()[4]?.[1]?.method).toBe('DELETE');
    expect(calls()[5]?.[0]).toBe(API_URL + '/api/v1/savings-goals/goal-1/archive');
    expect(calls()[6]?.[0]).toBe(API_URL + '/api/v1/dashboard/summary');
  });
});