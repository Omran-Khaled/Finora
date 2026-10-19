// Shared client-side collection pagination primitive.
//
// Small reference collections (accounts/categories/budgets/goals) fit on one
// screen, so every consumer wants "the whole list". The server still pages at
// 20/100 (`Apps/api/src/core/pagination.ts`), hence a single GET would silently
// truncate collections past the first page. This helper walks the
// `{ data, meta: { nextCursor } }` envelope with a bounded loop — no unbounded
// `while (nextCursor)` — and is shared by the mock and real adapters so their
// logical content stays equivalent.
export const COLLECTION_PAGE_LIMIT = 100;
export const COLLECTION_MAX_PAGES = 5;

export interface PagedEnvelope<T> {
  data: T[];
  meta?: { nextCursor: string | null } | null;
}

export async function collectAllPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<PagedEnvelope<T>>,
  maxPages: number = COLLECTION_MAX_PAGES,
): Promise<{ items: T[]; pagesFetched: number; truncated: boolean }> {
  const items: T[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  let truncated = false;
  for (let page = 0; page < maxPages; page += 1) {
    const envelope = await fetchPage(cursor);
    items.push(...(envelope.data ?? []));
    pagesFetched += 1;
    // Tolerate legacy/partial envelopes without `meta` (older unit mocks):
    // treat a missing envelope as the final page rather than crashing.
    cursor = envelope.meta?.nextCursor ?? undefined;
    if (!cursor) return { items, pagesFetched, truncated };
  }
  truncated = cursor !== undefined;
  return { items, pagesFetched, truncated };
}
