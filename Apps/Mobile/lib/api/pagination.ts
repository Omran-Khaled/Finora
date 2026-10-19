/**
 * Shared mobile collection-pagination primitive.
 *
 * Mirrors `Apps/Web/lib/pagination.ts`: reference collections render in full,
 * so adapters walk the `{ data, meta: { nextCursor } }` envelope with a bounded
 * loop (never an unbounded `while (nextCursor)`).
 */
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
  for (let page = 0; page < maxPages; page += 1) {
    const envelope = await fetchPage(cursor);
    items.push(...(envelope.data ?? []));
    pagesFetched += 1;
    cursor = envelope.meta?.nextCursor ?? undefined;
    if (!cursor) return { items, pagesFetched, truncated: false };
  }
  return { items, pagesFetched, truncated: cursor !== undefined };
}
