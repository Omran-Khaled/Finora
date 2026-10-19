/**
 * Calendar-month window helpers (F-019).
 *
 * A month window must use the *real* last day of the month. Previously the
 * Prisma date filters used a hardcoded `${prefix}-31`, which overflows for
 * February and the 30-day months: `new Date('2026-02-31')` rolls over to
 * 2026-03-03, so March rows leaked into the February summary and budget usage.
 */
export function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Last calendar day of `month` (1-12) as `YYYY-MM-DD` in UTC. */
export function endOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Inclusive `[from, to]` bounds and the `YYYY-MM` prefix for a month window. */
export function monthWindow(year: number, month: number): { prefix: string; from: string; to: string } {
  const prefix = monthPrefix(year, month);
  return { prefix, from: `${prefix}-01`, to: endOfMonth(year, month) };
}