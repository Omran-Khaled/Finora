// T-002 — real-adapter contract tests (Web).
// The adapter is the only place that knows the server's paths/headers; these
// tests pin the request shape so a server rename cannot silently break real mode.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpApi } from '@/lib/http-adapter';

const TOKEN_KEY = 'finora-auth-token';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** URL and init of the nth fetch call. */
function call(fetchMock: ReturnType<typeof vi.fn>, index = 0): { url: string; init: RequestInit } {
  return { url: String(fetchMock.mock.calls[index][0]), init: (fetchMock.mock.calls[index][1] ?? {}) as RequestInit };
}

function headers(fetchMock: ReturnType<typeof vi.fn>, index = 0): Headers {
  return new Headers(call(fetchMock, index).init.headers);
}

describe('http adapter — request contract (real mode)', () => {
  beforeEach(() => {
    window.sessionStorage.setItem(TOKEN_KEY, 'token-1');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('aborts timed-out requests, reports the timeout, and clears its timer', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = httpApi.categories.archive('cat-1');
    const rejection = expect(request).rejects.toThrow('Request timed out');
    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a timed-out GET before making its one safe retry', async () => {
    vi.useFakeTimers();
    let firstSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        firstSignal = init?.signal ?? undefined;
        return new Promise<Response>((_, reject) => {
          firstSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      })
      .mockImplementationOnce(() => {
        expect(firstSignal?.aborted).toBe(true);
        return Promise.resolve(jsonResponse({ data: [], meta: { nextCursor: null } }));
      });
    vi.stubGlobal('fetch', fetchMock);

    const request = httpApi.accounts.list();
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(request).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends the bearer token with the exact Authorization casing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await httpApi.accounts.list();

    expect(headers(fetchMock).get('Authorization')).toBe('Bearer token-1');
    expect(headers(fetchMock).get('Content-Type')).toBe('application/json');
  });

  it('serialises every documented transaction filter into the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], meta: { nextCursor: null } }));
    vi.stubGlobal('fetch', fetchMock);

    await httpApi.transactions.list({
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      from: '2026-08-01',
      to: '2026-08-31',
      cursor: 'tx-20',
      limit: 20,
    });

    const { url, init } = call(fetchMock);
    expect(url).toContain('/transactions?');
    for (const fragment of ['accountId=acc-1', 'categoryId=cat-1', 'type=EXPENSE', 'from=2026-08-01', 'to=2026-08-31', 'cursor=tx-20', 'limit=20']) {
      expect(url).toContain(fragment);
    }
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('omits undefined filters instead of sending empty query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], meta: { nextCursor: null } }));
    vi.stubGlobal('fetch', fetchMock);

    await httpApi.transactions.list({ type: 'INCOME' });

    const { url } = call(fetchMock);
    expect(url).toContain('type=INCOME');
    expect(url).not.toContain('accountId=');
    expect(url).not.toContain('cursor=');
    expect(url).not.toContain('limit=');
  });

  it('propagates the server error envelope for a failed request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.', requestId: 'req_1' } }, 401)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpApi.accounts.list()).rejects.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('targets the server paths for every resource', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await httpApi.accounts.get('acc-1');
    await httpApi.accounts.archive('acc-1');
    await httpApi.transactions.void('tx-1');
    await httpApi.categories.archive('cat-1');
    await httpApi.budgets.delete('bud-1');
    await httpApi.savingsGoals.archive('goal-1');
    await httpApi.dashboard.getSummary();

    expect(call(fetchMock, 0).url).toMatch(/\/accounts\/acc-1$/);
    expect(call(fetchMock, 1).url).toContain('/accounts/acc-1/archive');
    expect(call(fetchMock, 1).init.method).toBe('POST');
    expect(call(fetchMock, 2).url).toContain('/transactions/tx-1/void');
    expect(call(fetchMock, 2).init.method).toBe('POST');
    expect(call(fetchMock, 3).url).toContain('/categories/cat-1/archive');
    expect(call(fetchMock, 4).url).toContain('/budgets/bud-1');
    expect(call(fetchMock, 4).init.method).toBe('DELETE');
    expect(call(fetchMock, 5).url).toContain('/savings-goals/goal-1/archive');
    expect(call(fetchMock, 6).url).toContain('/dashboard/summary');
  });

  it('POSTs financial creates to /transactions and /transfers as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await httpApi.transactions.create({ type: 'INCOME', accountId: 'acc-1', amountMinor: '500', transactionDate: '2026-09-01' }, 'key-transaction');
    await httpApi.transfers.create({ fromAccountId: 'acc-1', toAccountId: 'acc-2', amountMinor: '500', transactionDate: '2026-09-01' }, 'key-transfer');

    expect(call(fetchMock, 0).url).toMatch(/\/transactions$/);
    expect(call(fetchMock, 0).init.method).toBe('POST');
    expect(JSON.parse(String(call(fetchMock, 0).init.body))).toMatchObject({ accountId: 'acc-1', amountMinor: '500' });
    expect(call(fetchMock, 1).url).toMatch(/\/transfers$/);
    expect(call(fetchMock, 1).init.method).toBe('POST');
    expect(headers(fetchMock, 0).get('Idempotency-Key')).toBe('key-transaction');
    expect(headers(fetchMock, 1).get('Idempotency-Key')).toBe('key-transfer');
  });

  it('sends Idempotency-Key for financial creates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await httpApi.transactions.create({ type: 'INCOME', accountId: 'acc-1', amountMinor: '500', transactionDate: '2026-09-01' }, 'key-required');

    expect(headers(fetchMock).get('Idempotency-Key')).toBe('key-required');
  });

  it('keeps the new session bearer token and idempotency key on both financial creates', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { token: 'new-session-token', user: { id: 'user-1' } } }))
      .mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.removeItem(TOKEN_KEY);

    await httpApi.auth.register({
      email: 'new-user@example.com',
      password: 'correct-horse-battery-staple',
      baseCurrency: 'USD',
    });
    await httpApi.transactions.create(
      { type: 'INCOME', accountId: 'acc-1', amountMinor: '500', transactionDate: '2026-09-01' },
      'key-transaction',
    );
    await httpApi.transfers.create(
      { fromAccountId: 'acc-1', toAccountId: 'acc-2', amountMinor: '500', transactionDate: '2026-09-01' },
      'key-transfer',
    );

    for (const [index, key] of [[1, 'key-transaction'], [2, 'key-transfer']] as const) {
      const requestHeaders = headers(fetchMock, index);
      expect(requestHeaders.get('Authorization')).toBe('Bearer new-session-token');
      expect(requestHeaders.get('Idempotency-Key')).toBe(key);
    }
  });

  it('sends rename-only PATCH bodies for categories and savings goals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await httpApi.categories.update('cat-1', { name: 'Groceries' });
    await httpApi.savingsGoals.update('goal-1', { name: 'Laptop Pro' });

    // Canonical PATCH payloads: `{ name }` and nothing else. The real API runs
    // with forbidNonWhitelisted, so extra fields (type, targetAmountMinor,
    // targetDate) would be rejected with 400.
    const categoryCall = call(fetchMock, 0);
    expect(categoryCall.url).toContain('/categories/cat-1');
    expect(categoryCall.init.method).toBe('PATCH');
    expect(JSON.parse(String(categoryCall.init.body))).toEqual({ name: 'Groceries' });

    const goalCall = call(fetchMock, 1);
    expect(goalCall.url).toContain('/savings-goals/goal-1');
    expect(goalCall.init.method).toBe('PATCH');
    expect(JSON.parse(String(goalCall.init.body))).toEqual({ name: 'Laptop Pro' });
  });

  it('surfaces a missing transfer as the documented 404 envelope (X-001c)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpApi.transfers.get('missing')).rejects.toMatchObject({
      error: { code: 'TRANSACTION_NOT_FOUND' },
    });
  });
});