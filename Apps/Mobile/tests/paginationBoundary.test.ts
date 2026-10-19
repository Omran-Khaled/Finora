/**
 * Client pagination boundary (mobile): the shared primitive walks bounded
 * pages and both adapters return the full logical collection.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { collectAllPages, COLLECTION_MAX_PAGES } from '../lib/api/pagination';
import { mockAdapter } from '../lib/api/mockAdapter';
import type { HttpAdapter } from '../lib/api/httpAdapter';

const API_URL = 'https://api.test.local';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('mobile pagination primitive', () => {
  it('collects 0, 1, 20, 21 records and caps unbounded walks', async () => {
    for (const count of [0, 1, 20, 21]) {
      const rows = Array.from({ length: count }, (_, i) => ({ id: `id-${i}` }));
      const result = await collectAllPages(async (cursor?: string) => {
        const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
        const data = rows.slice(start, start + 100);
        const next = start + 100 < rows.length ? (data[data.length - 1]?.id ?? null) : null;
        return { data, meta: { nextCursor: next } };
      });
      expect(result.items).toHaveLength(count);
      expect(result.truncated).toBe(false);
    }
    const rows = Array.from({ length: 600 }, (_, i) => ({ id: `id-${i}` }));
    const capped = await collectAllPages(async (cursor?: string) => {
      const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
      const data = rows.slice(start, start + 100);
      return { data, meta: { nextCursor: data[data.length - 1]?.id ?? null } };
    });
    expect(capped.pagesFetched).toBe(COLLECTION_MAX_PAGES);
    expect(capped.truncated).toBe(true);
  });
});

describe('mobile adapters return full collections', () => {
  let fetchMock: jest.Mock<typeof fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_URL = API_URL;
    fetchMock = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] })) as unknown as jest.Mock<typeof fetch>;
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    jest.restoreAllMocks();
  });

  it('http adapter walks every page past the first', async () => {
    const loaded = require('../lib/api/httpAdapter') as { HttpAdapter: new () => HttpAdapter };
    const adapter = new loaded.HttpAdapter();
    adapter.setToken('token-1');
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `acc-${i}` }));
    fetchMock.mockImplementation(async (url: unknown) => {
      const parsed = new URL(String(url));
      const cursor = parsed.searchParams.get('cursor');
      const limit = Number(parsed.searchParams.get('limit') ?? '100');
      const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
      const window = rows.slice(start, start + limit + 1);
      const data = window.slice(0, limit);
      const nextCursor = window.length > limit ? (data[data.length - 1]?.id ?? null) : null;
      return jsonResponse({ data, meta: { nextCursor } });
    });
    const res = await adapter.getAccounts('u1');
    expect(res.data).toHaveLength(25);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('mock adapter pages transactions by id cursor and ends on stale cursors', async () => {
    await mockAdapter.register({ email: 'pages@example.com', password: 'secret123' });
    const first = await mockAdapter.getTransactions('usr_demo_finora', { limit: 5 });
    expect(first.data.length).toBeLessThanOrEqual(5);
    const stale = await mockAdapter.getTransactions('usr_demo_finora', { cursor: 'missing-id', limit: 5 });
    expect(stale).toEqual({ data: [], meta: { nextCursor: null } });
  });
});
