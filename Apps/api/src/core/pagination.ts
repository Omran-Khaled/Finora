import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Shared pagination contract (F-018).
 *
 * Every list endpoint accepts `?cursor=<id>&limit=<n>` and answers with the
 * documented `{ data, meta: { nextCursor } }` envelope. `cursor` is the `id` of
 * the last item of the previous page (keyset pagination), so results stay stable
 * while new rows are appended.
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PaginationQuery {
  @ApiPropertyOptional({
    type: 'string',
    description: 'Opaque cursor: the `id` returned as `meta.nextCursor` by the previous page.',
    example: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: `Maximum number of items to return (default ${DEFAULT_PAGE_SIZE}, max ${MAX_PAGE_SIZE}).`,
    example: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** `undefined` means "read everything" (internal aggregate queries); `{}` means page 1. */
export interface PageRequest {
  cursor?: string;
  limit?: number;
}

export function pageSize(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(limit, MAX_PAGE_SIZE);
}

/** Prisma findMany arguments implementing the keyset window (`take: limit + 1`). */
export function prismaPageArgs(page?: PageRequest): { cursor?: { id: string }; skip?: number; take?: number } {
  if (page === undefined) return {};
  const args: { cursor?: { id: string }; skip?: number; take?: number } = { take: pageSize(page.limit) + 1 };
  if (page.cursor) {
    args.cursor = { id: page.cursor };
    args.skip = 1;
  }
  return args;
}

/** Wraps raw rows into the documented page envelope. */
export function toPage<T extends { id: string }>(rows: T[], page?: PageRequest): Page<T> {
  if (page === undefined) return { data: rows, nextCursor: null };
  return pageFromRows(rows, pageSize(page.limit));
}

/** In-memory sibling of {@link toPage} for the InMemoryStore paths. */
export function toPageInMemory<T extends { id: string }>(items: T[], page?: PageRequest): Page<T> {
  if (page === undefined) return { data: items, nextCursor: null };
  return paginateInMemory(items, pageSize(page.limit), page.cursor);
}

/**
 * Keyset slice over an already ordered in-memory list. An unknown cursor (the
 * anchor row was deleted, or a stale cursor is replayed) yields an empty page,
 * mirroring how the Prisma path treats a missing cursor row.
 */
export function paginateInMemory<T extends { id: string }>(items: T[], limit: number, cursor?: string): Page<T> {
  let start = 0;
  if (cursor) {
    const index = items.findIndex((item) => item.id === cursor);
    start = index === -1 ? items.length : index + 1;
  }
  const window = items.slice(start, start + limit + 1);
  const data = window.slice(0, limit);
  const nextCursor = window.length > limit ? (data[data.length - 1]?.id ?? null) : null;
  return { data, nextCursor };
}

/** Turns a Prisma `take: limit + 1` window into a page with its `nextCursor`. */
export function pageFromRows<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, nextCursor: hasMore ? (data[data.length - 1]?.id ?? null) : null };
}