/**
 * A-003 / F-012 regression guard (mobile): an expired bearer token must trigger
 * exactly one POST /auth/refresh followed by one replay of the original GET, and
 * the rotated token must be the one used on the retry.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import type { ApiAdapter } from '../lib/api/adapter';
import type { HttpAdapter } from '../lib/api/httpAdapter';

const API_URL = 'https://api.test.local';

type FetchArgs = [string, { method?: string; headers?: Record<string, string> }];

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const unauthorized = () =>
  jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.', requestId: 'req_1' } }, 401);

describe('mobile http adapter — refresh on 401 (A-003)', () => {
  let adapter: HttpAdapter;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_URL = API_URL;
    // Loaded after the env var is set: the adapter resolves its base URL at import time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require('../lib/api/httpAdapter') as { HttpAdapter: new () => HttpAdapter };
    adapter = new loaded.HttpAdapter();
    adapter.setToken('expired-token');
  });

  afterEach(async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    jest.restoreAllMocks();
    const { SecureStorage } = require('../lib/storage/secureStorage') as typeof import('../lib/storage/secureStorage');
    await SecureStorage.clearSession();
  });

  it('refreshes once and replays the original GET with the rotated token', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse({ data: { token: 'fresh-token', user: { id: 'u1', email: 'a@b.c' } } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await adapter.getAccounts('u1');

    expect(response.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calls = fetchMock.mock.calls as unknown as FetchArgs[];
    expect(calls[1]?.[0]).toContain('/auth/refresh');
    expect(calls[1]?.[1]?.method).toBe('POST');
    expect(calls[2]?.[1]?.headers?.Authorization).toBe('Bearer fresh-token');
  });

  it('retries only once: a still-401 response surfaces the UNAUTHORIZED envelope', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse({ data: { token: 'fresh-token', user: { id: 'u1' } } }))
      .mockResolvedValueOnce(unauthorized());
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(adapter.getAccounts('u1')).rejects.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not refresh when there is no session token', async () => {
    adapter.setToken(null);
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValueOnce(unauthorized());
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(adapter.getBudgets('u1')).rejects.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh financial POSTs', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValueOnce(unauthorized());
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      adapter.createTransaction('u1', { type: 'INCOME', accountId: 'a', amountMinor: '1', transactionDate: '2026-09-01' }, 'key-financial'),
    ).rejects.toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exposes an explicit refresh() on the adapter contract', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { token: 'fresh-token', user: { id: 'u1' } } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await adapter.refresh();

    expect(response.data.token).toBe('fresh-token');
    const calls = fetchMock.mock.calls as unknown as FetchArgs[];
    expect(calls[0]?.[0]).toContain('/auth/refresh');

    // The mock adapter implements the same member (Mock ↔ Real parity).
    jest.resetModules();
    const mockLoaded = require('../lib/api/mockAdapter') as { mockAdapter: ApiAdapter };
    expect(typeof mockLoaded.mockAdapter.refresh).toBe('function');
    const mockRefreshed = await mockLoaded.mockAdapter.refresh();
    expect(typeof mockRefreshed.data.token).toBe('string');
  });

  it('retains the existing credential after a transient network failure with a lost refresh response', async () => {
    const previousUser = { id: 'u1', email: 'a@b.c' };
    const { SecureStorage } = require('../lib/storage/secureStorage') as typeof import('../lib/storage/secureStorage');
    await SecureStorage.setItem('auth_token', 'expired-token');
    await SecureStorage.setItem('session_user', JSON.stringify(previousUser));

    const fetchMock = jest.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('connection lost'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(adapter.refresh()).rejects.toMatchObject({ error: { code: 'NETWORK_ERROR' } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await SecureStorage.getItem('auth_token')).toBe('expired-token');
    expect(JSON.parse((await SecureStorage.getItem('session_user')) ?? '{}')).toEqual(previousUser);
  });

  it('surfaces a transient refresh failure instead of the preceding request 401', async () => {
    const { SecureStorage } = require('../lib/storage/secureStorage') as typeof import('../lib/storage/secureStorage');
    await SecureStorage.setItem('auth_token', 'expired-token');
    await SecureStorage.setItem('session_user', JSON.stringify({ id: 'u1' }));
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unauthorized())
      .mockRejectedValueOnce(new TypeError('connection lost'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(adapter.getAccounts('u1')).rejects.toMatchObject({ error: { code: 'NETWORK_ERROR' } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await SecureStorage.getItem('auth_token')).toBe('expired-token');
    expect(JSON.parse((await SecureStorage.getItem('session_user')) ?? '{}')).toMatchObject({ id: 'u1' });
  });

  it('retains credentials after a refresh timeout', async () => {
    const { SecureStorage } = require('../lib/storage/secureStorage') as typeof import('../lib/storage/secureStorage');
    await SecureStorage.setItem('auth_token', 'expired-token');
    await SecureStorage.setItem('session_user', JSON.stringify({ id: 'u1' }));
    const timeoutError = new Error('aborted');
    timeoutError.name = 'AbortError';
    global.fetch = jest.fn<typeof fetch>().mockRejectedValueOnce(timeoutError) as unknown as typeof fetch;

    await expect(adapter.refresh()).rejects.toMatchObject({ error: { code: 'NETWORK_ERROR' } });
    expect(await SecureStorage.getItem('auth_token')).toBe('expired-token');
    expect(JSON.parse((await SecureStorage.getItem('session_user')) ?? '{}')).toMatchObject({ id: 'u1' });
  });

  it('retains credentials after a refresh server failure', async () => {
    const { SecureStorage } = require('../lib/storage/secureStorage') as typeof import('../lib/storage/secureStorage');
    await SecureStorage.setItem('auth_token', 'expired-token');
    await SecureStorage.setItem('session_user', JSON.stringify({ id: 'u1' }));
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.', requestId: 'req_server' },
    }, 500));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(adapter.refresh()).rejects.toMatchObject({
      status: 500,
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(await SecureStorage.getItem('auth_token')).toBe('expired-token');
    expect(JSON.parse((await SecureStorage.getItem('session_user')) ?? '{}')).toMatchObject({ id: 'u1' });
  });

  it('clears credentials only after a definitive unauthorized refresh response', async () => {
    const { SecureStorage } = require('../lib/storage/secureStorage') as typeof import('../lib/storage/secureStorage');
    await SecureStorage.setItem('auth_token', 'expired-token');
    await SecureStorage.setItem('session_user', JSON.stringify({ id: 'u1' }));
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValueOnce(unauthorized());
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(adapter.refresh()).rejects.toMatchObject({
      status: 401,
      error: { code: 'UNAUTHORIZED' },
    });

    expect(await SecureStorage.getItem('auth_token')).toBeNull();
    expect(await SecureStorage.getItem('session_user')).toBeNull();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await adapter.getAccounts('u1');
    expect((fetchMock.mock.calls as unknown as FetchArgs[])[1]?.[1]?.headers?.Authorization).toBeUndefined();
  });

  it('single-flights concurrent 401 refreshes and persists the rotated session', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse({
        data: { token: 'fresh-token', user: { id: 'u1', email: 'a@b.c' } },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const [first, second] = await Promise.all([
      adapter.getAccounts('u1'),
      adapter.getBudgets('u1'),
    ]);

    expect(first.data).toEqual([]);
    expect(second.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect((fetchMock.mock.calls as unknown as FetchArgs[]).filter(([url]) => url.includes('/auth/refresh'))).toHaveLength(1);
    const { SecureStorage } = require('../lib/storage/secureStorage') as typeof import('../lib/storage/secureStorage');
    expect(await SecureStorage.getItem('auth_token')).toBe('fresh-token');
    expect(JSON.parse((await SecureStorage.getItem('session_user')) ?? '{}')).toMatchObject({ id: 'u1' });
  });
});