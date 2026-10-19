import {
  CURRENCY_EXPONENTS,
  CURRENCY_MAP,
  isAccountType,
  MONTHS,
} from './constants';

// Format minor units to display string — presentation-only (Section 10, 11).
// The API sends/receives integer minor units; the frontend formats for display only.

export function formatMoney(
  amountMinor: string,
  currencyCode: string,
  options?: { showSymbol?: boolean; showCode?: boolean }
): string {
  const currency = CURRENCY_MAP[currencyCode];
  const symbol = currency?.symbol ?? currencyCode;
  const minor = BigInt(amountMinor);
  const isNegative = minor < 0n;
  const absolute = isNegative ? -minor : minor;

  const decimals = CURRENCY_EXPONENTS[currencyCode] ?? 2;

  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, '0');
  const formatted = `${whole.toLocaleString('en-US')}${decimals ? `.${fraction}` : ''}`;

  const sign = isNegative ? '-' : '';
  const showSymbol = options?.showSymbol ?? true;
  const showCode = options?.showCode ?? false;

  if (showCode) {
    return `${sign}${formatted} ${currencyCode}`;
  }
  if (showSymbol) {
    return `${sign}${symbol}${formatted}`;
  }
  return `${sign}${formatted}`;
}

// Parse a display amount string to minor units for API submission.
// Anything that is not a plain non-negative decimal (signs, letters, garbage)
// is rejected as 0 — a minus sign must never silently become a positive amount.
export function parseAmountToMinor(
  input: string,
  currencyCode: string,
  options?: { allowZero?: boolean },
): string | null {
  if (!input.trim() || !/^\d*(\.\d+)?$/.test(input)) return null;
  const [whole = '', fraction = ''] = input.split('.');
  const decimals = CURRENCY_EXPONENTS[currencyCode] ?? 2;
  if (fraction.length > decimals) return null;
  const normalizedWhole = whole || '0';
  const minor = BigInt(normalizedWhole) * 10n ** BigInt(decimals) +
    BigInt((fraction || '').padEnd(decimals, '0') || '0');
  if (minor > 0n) return minor.toString();
  return options?.allowZero && minor === 0n ? '0' : null;
}

// Convert minor units back to a plain decimal string for editing inputs.
export function minorToDisplay(amountMinor: string, currencyCode: string): string {
  const decimals = CURRENCY_EXPONENTS[currencyCode] ?? 2;
  const minor = BigInt(amountMinor);
  const sign = minor < 0n ? '-' : '';
  const absolute = minor < 0n ? -minor : minor;
  const scale = 10n ** BigInt(decimals);
  return `${sign}${absolute / scale}${decimals ? `.${(absolute % scale).toString().padStart(decimals, '0')}` : ''}`;
}

// Validates a user-entered decimal amount: digits only, at most the currency's
// decimal places (2, or 0 for zero-decimal currencies like JPY).
export function isValidAmountInput(input: string, currencyCode: string): boolean {
  const decimals = CURRENCY_EXPONENTS[currencyCode] ?? 2;
  return new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`).test(input);
}

// Format a date string (YYYY-MM-DD) to a human-readable format
export function formatDate(
  dateStr: string,
  format: 'short' | 'medium' | 'long' = 'medium'
): string {
  const date = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  if (format === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (format === 'long') {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatMonthYear(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatAccountType(value: unknown): string {
  if (!isAccountType(value)) return 'Unknown type';
  switch (value) {
    case 'CASH':
      return 'Cash';
    case 'BANK':
      return 'Bank';
    case 'SAVINGS':
      return 'Savings';
  }
}

// Get greeting based on time of day
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Get initials from email
export function getInitials(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Relative time
export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr, 'short');
}
