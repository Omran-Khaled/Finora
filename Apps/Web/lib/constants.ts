import type { AccountType, CategoryType } from './types';
import { CURRENCY_SPECS } from '@finora/contracts';

// A.11 — Fixed values

export const ACCOUNT_TYPES: AccountType[] = ['CASH', 'BANK', 'SAVINGS'];

export function isAccountType(value: unknown): value is AccountType {
  return (
    typeof value === 'string' &&
    ACCOUNT_TYPES.some((accountType) => accountType === value)
  );
}

export const SYSTEM_CATEGORIES: { name: string; type: CategoryType }[] = [
  { name: 'Food', type: 'EXPENSE' },
  { name: 'Transport', type: 'EXPENSE' },
  { name: 'Bills', type: 'EXPENSE' },
  { name: 'Shopping', type: 'EXPENSE' },
  { name: 'Health', type: 'EXPENSE' },
  { name: 'Entertainment', type: 'EXPENSE' },
  { name: 'Education', type: 'EXPENSE' },
  { name: 'Other', type: 'EXPENSE' },
];

export const CURRENCIES = CURRENCY_SPECS;

export const CURRENCY_MAP = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c])
);

export const CURRENCY_EXPONENTS: Record<string, number> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c.minorUnit])
);

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DEFAULT_PAGE_SIZE = 20;

// Navigation
export const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Accounts', href: '/accounts', icon: 'Wallet' },
  { label: 'Transactions', href: '/transactions', icon: 'ArrowLeftRight' },
  { label: 'Budgets', href: '/budgets', icon: 'PiggyBank' },
  { label: 'Savings Goals', href: '/savings', icon: 'Target' },
  { label: 'Settings', href: '/settings', icon: 'Settings' },
] as const;

export const MOBILE_NAV_ITEMS = [
  { label: 'Home', href: '/dashboard', icon: 'Home' },
  { label: 'Transactions', href: '/transactions', icon: 'ArrowLeftRight' },
  { label: 'Budgets', href: '/budgets', icon: 'PiggyBank' },
  { label: 'More', href: '/more', icon: 'Menu' },
] as const;
