// A-003 / F-012 regression guard: an expired bearer token must trigger exactly one
// POST /auth/refresh followed by one replay of the original GET.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpApi } from '@/lib/http-adapter';
import type { User } from '@/lib/types';

const TOKEN_KEY = 'finora-auth-token';

const user: User = {
  id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
  email: 'sarah@example.com',
  baseCurrency: 'USD',
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const unauthorized = () => jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.', requestId: 'req_1' } }, 401);

describe('http adapter — session refresh (real mode)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('refreshes once and replays the original GET with the new token', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'expired-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized()) // GET /accounts -> expired
      .mockResolvedValueOnce(jsonResponse({ data: { token: 'fresh-token', user } })) // POST /auth/refresh
      .mockResolvedValueOnce(jsonResponse({ data: [] })); // replayed GET /accounts
    vi.stubGlobal('fetch', fetchMock);

    const accounts = await httpApi.accounts.list();

    expect(accounts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('POST');
    const retryHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('fresh-token');
  });


  it('single-flights concurrent GET refreshes so one rotated session is consumed', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'expired-token');
    let accountCalls = 0;
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        return jsonResponse({ data: { token: 'fresh-token', user } });
      }
      accountCalls += 1;
      if (accountCalls <= 2) return unauthorized();
      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = httpApi.accounts.list();
    const second = httpApi.accounts.list();
    await Promise.resolve();
    releaseRefresh();
    await Promise.all([first, second]);

    expect(refreshCalls).toBe(1);
    expect(accountCalls).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('retries only once: a refreshed 401 stays a 401 envelope (no loop)', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'expired-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized()) // GET
      .mockResolvedValueOnce(jsonResponse({ data: { token: 'fresh-token', user } })) // POST /auth/refresh
      .mockResolvedValueOnce(unauthorized()); // replayed GET still 401
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpApi.accounts.list()).rejects.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not attempt a refresh when no token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(unauthorized());
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpApi.auth.me()).rejects.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh non-GET requests', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'expired-token');
    const fetchMock = vi.fn().mockResolvedValueOnce(unauthorized());
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpApi.transactions.create({ type: 'INCOME', accountId: 'a', amountMinor: '1', transactionDate: '2026-09-01' }, 'refresh-test-key'))
      .rejects.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exposes an explicit refresh() that rotates the stored token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { token: 'fresh-token', user } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpApi.auth.refresh();

    expect(result.token).toBe('fresh-token');
    expect(result.data).toEqual(user);
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('fresh-token');
  });
});