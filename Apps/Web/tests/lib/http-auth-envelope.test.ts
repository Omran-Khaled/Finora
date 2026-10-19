// B-003 / F-003 regression guard: the real-mode adapter must read the server
// envelope `{ data: { token, user } }` (not a doubly-nested `{data:{data,token}}`),
// persist the bearer token and resolve the same `{ data: User, token }` shape the
// mock adapter resolves — otherwise real mode stores no token (401 everywhere)
// and `AuthProvider` receives `undefined` as the user.
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
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('http adapter — auth envelope (real mode)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('register: stores the non-empty bearer token and resolves the user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { token: 'token-register', user } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpApi.auth.register({ email: user.email, password: 'correct horse battery staple', baseCurrency: 'USD' });

    expect(result.token).toBe('token-register');
    expect(result.data).toEqual(user);
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('token-register');
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/register');
  });

  it('login: stores the non-empty bearer token and resolves the user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { token: 'token-login', user } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpApi.auth.login({ email: user.email, password: 'correct horse battery staple' });

    expect(result.token).toBe('token-login');
    expect(result.data).toEqual(user);
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('token-login');
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/login');
  });

  it('sends the persisted token as a bearer header on subsequent requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { token: 'token-login', user } }))
      .mockResolvedValueOnce(jsonResponse({ data: [user] }));
    vi.stubGlobal('fetch', fetchMock);

    await httpApi.auth.login({ email: user.email, password: 'correct horse battery staple' });
    await httpApi.accounts.list();

    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-login');
  });

  it('logout clears the persisted token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.setItem(TOKEN_KEY, 'token-login');

    await httpApi.auth.logout();

    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});