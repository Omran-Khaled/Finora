// Client pagination boundary: the shared primitive walks bounded pages and
// both adapters return the full logical collection (no first-page truncation).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mockApi } from '@/lib/mock-adapter';
import { httpApi } from '@/lib/http-adapter';
import { mockAuth, mockAccountsApi, mockCategoriesApi, mockBudgetsApi, mockSavingsGoalsApi } from '@/lib/mock-server';
import { collectAllPages, COLLECTION_MAX_PAGES } from '@/lib/pagination';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe('client pagination primitive', () => {
  it('collects 0, 1, 20, 21 and 100+ records without gaps', async () => {
    const make = (count: number) => {
      const rows = Array.from({ length: count }, (_, i) => ({ id: `id-${i}` }));
      return collectAllPages(async (cursor) => {
        const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
        const data = rows.slice(start, start + 100);
        const next = start + 100 < rows.length ? (data[data.length - 1]?.id ?? null) : null;
        return { data, meta: { nextCursor: next } };
      });
    };
    for (const count of [0, 1, 20, 21]) {
      const result = await make(count);
      expect(result.items).toHaveLength(count);
      expect(result.truncated).toBe(false);
      expect(result.pagesFetched).toBeLessThanOrEqual(COLLECTION_MAX_PAGES);
    }
    const large = await make(250);
    expect(large.items).toHaveLength(250);
    expect(large.pagesFetched).toBe(3);
    expect(large.truncated).toBe(false);
  });

  it('stops after the max page count with truncated=true', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ id: `id-${i}` }));
    const result = await collectAllPages(async (cursor) => {
      const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
      const data = rows.slice(start, start + 100);
      return { data, meta: { nextCursor: data[data.length - 1]?.id ?? null } };
    });
    expect(result.pagesFetched).toBe(COLLECTION_MAX_PAGES);
    expect(result.truncated).toBe(true);
  });

  it('ends on an invalid cursor with an empty page', async () => {
    const result = await collectAllPages(async () => ({ data: [], meta: { nextCursor: null } }));
    expect(result.items).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

describe('mock adapter pagination parity', () => {
  beforeEach(() => {
    mockAuth.reset();
  });

  it('walks mock pages past the 20 default and aggregates the full list', async () => {
    await mockApi.auth.register({ email: 'pages@finora.app', password: 'secret123' });
    for (let i = 0; i < 25; i += 1) {
      await mockAccountsApi.create({ name: `Extra ${i}`, type: 'CASH', currencyCode: 'USD', openingBalanceMinor: '0' });
    }
    const page1 = await mockAccountsApi.listPage(undefined, 20);
    expect(page1.data).toHaveLength(20);
    expect(page1.meta.nextCursor).toBe(page1.data[19].id);
    const page2 = await mockAccountsApi.listPage(page1.meta.nextCursor ?? undefined, 20);
    expect(page2.data.length).toBeGreaterThan(0);
    const stale = await mockAccountsApi.listPage('missing-cursor', 20);
    expect(stale).toEqual({ data: [], meta: { nextCursor: null } });
    const full = await mockApi.accounts.list();
    expect(full.length).toBeGreaterThanOrEqual(25);
    expect(new Set(full.map((a) => a.id)).size).toBe(full.length);
    expect(await mockApi.categories.list().then((rows) => rows.length)).toBeGreaterThan(0);
    expect((await mockCategoriesApi.listPage(undefined, 100)).meta.nextCursor).toBeNull();
    expect((await mockBudgetsApi.listPage(undefined, 100)).meta.nextCursor).toBeNull();
    expect((await mockSavingsGoalsApi.listPage(undefined, 100)).meta.nextCursor).toBeNull();
  });
});

describe('http adapter pagination parity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('fetches every page for reference lists', async () => {
    window.sessionStorage.setItem('finora-auth-token', 'token-1');
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `acc-${i}` }));
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url, 'http://localhost');
      const limit = Number(parsed.searchParams.get('limit') ?? '100');
      const cursor = parsed.searchParams.get('cursor');
      const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
      const window = rows.slice(start, start + limit + 1);
      const data = window.slice(0, limit);
      const nextCursor = window.length > limit ? (data[data.length - 1]?.id ?? null) : null;
      return jsonResponse({ data, meta: { nextCursor } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const accounts = await httpApi.accounts.list();
    expect(accounts).toHaveLength(25);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain('limit=100');
  });
});
