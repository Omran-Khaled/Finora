/**
 * MONEY + DATE FORMATTING (Section 11 — Money Representation).
 * All financial math uses integer minor units; no floating-point logic.

 * Parsing converts user decimal input directly to integer minor units using
 * string arithmetic (never float multiplication), preventing rounding drift.
 */

import { CURRENCY_SPECS } from "@finora/contracts";

const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  CURRENCY_SPECS.map((spec) => [spec.code, spec.symbol]),
);

export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = Object.fromEntries(
  CURRENCY_SPECS.map((spec) => [spec.code, spec.minorUnit]),
);

export function currencySymbol(currencyCode: string): string {
  const code = (currencyCode || 'USD').toUpperCase();
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

/** 1299 -> "$12.99" (integer math; no floats). */
export function formatMoney(amountMinor: string | number, currencyCode = 'USD'): string {
  const minor = BigInt(amountMinor);
  const isNegative = minor < 0n;
  const absMinor = isNegative ? -minor : minor;
  const decimals = CURRENCY_EXPONENTS[currencyCode.toUpperCase()] ?? 2;
  const scale = 10n ** BigInt(decimals);
  const major = absMinor / scale;
  const frac = (absMinor % scale).toString().padStart(decimals, '0');
  const symbol = currencySymbol(currencyCode);
  return `${isNegative ? '-' : ''}${symbol}${major.toString()}${decimals ? `.${frac}` : ''}`;
}

/**
 * "12.99" / "1,234.5" → 1299 (integer minor units).
 * Returns null when the input is not a valid non-negative decimal money string.
 */
export function parseAmountToMinor(
  input: string,
  currencyCode = 'USD',
  options?: { allowZero?: boolean },
): string | null {
  const raw = String(input ?? '').trim().replaceAll(',', '');
  if (!raw || raw === '.') return null;
  if (raw.startsWith('-') || raw.startsWith('+')) return null;
  if (!/^(\d*)(\.\d*)?$/.test(raw)) return null;

  const [wholePart, fracPartRaw] = raw.split('.');
  const whole = wholePart?.length ? wholePart.replace(/^0+(?=\d)/, '') : '0';
  const fracRaw = fracPartRaw ?? '';
  const decimals = CURRENCY_EXPONENTS[currencyCode.toUpperCase()] ?? 2;
  if (fracRaw.length > decimals) return null;
  const frac = fracRaw.padEnd(decimals, '0');
  const minor = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || '0');
  if (minor > 0n) return minor.toString();
  return options?.allowZero && minor === 0n ? '0' : null;
}

/** Calculates a bounded percentage from minor units without numeric money math. */
export function minorPercentage(part: bigint, whole: bigint, maximum = 100n): number {
  if (whole <= 0n) return 0;
  const cap = (whole * maximum) / 100n;
  const boundedPart = part < 0n ? 0n : part > cap ? cap : part;
  const scaled = (boundedPart * 10000n + whole / 2n) / whole;
  return Number(scaled.toString()) / 100;
}

/** 1299 -> "12.99" (display helper for form pre-fill; two decimals always.. */
export function minorToDecimal(amountMinor: string | number, currencyCode = 'USD'): string {
  const minor = BigInt(amountMinor);
  const isNegative = minor < 0n;
  const absMinor = isNegative ? -minor : minor;
  const decimals = CURRENCY_EXPONENTS[currencyCode.toUpperCase()] ?? 2;
  const scale = 10n ** BigInt(decimals);
  const major = absMinor / scale;
  const frac = (absMinor % scale).toString().padStart(decimals, '0');
  return `${isNegative ? '-' : ''}${major.toString()}${decimals ? `.${frac}` : ''}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "YYYY-MM-DD" → "Sep 4, 2026" (Hermes-safe manual formatting). */
export function formatDate(dateString: string): string {
  if (!dateString) return '';
  const [y, mRaw, d] = dateString.split('-');
  if (!y || !mRaw || !d) return dateString;
  const year = Number(y);
  const month = Number(mRaw);
  const day = Number(d);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateString;
  const monthLabel = MONTHS_SHORT[month - 1] || String(month);
  return `${monthLabel} ${day}, ${year}`;
}

export function monthName(month: number): string {
  return MONTHS[month - 1] || String(month);
}

/** Current local date in "YYYY-MM-DD". */
export function todayISO(): string {
  const now = new Date();
  return toISODate(now);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Validate "YYYY-MM-DD" and ensure it is a real calendar date. */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-') as [string, string, string];
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}