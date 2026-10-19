'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Moon,
  PiggyBank,
  Plus,
  Settings,
  Sun,
  Tags,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';

const SIDEBAR_PREFERENCE_KEY = 'finora:sidebar-collapsed';

const NAV_ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Accounts', href: '/accounts', icon: Wallet },
  { label: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { label: 'Budgets', href: '/budgets', icon: PiggyBank },
  { label: 'Savings goals', href: '/savings', icon: Target },
  { label: 'Categories', href: '/categories', icon: Tags },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function isPathActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readCollapsedPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsedPreference(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(collapsed));
  } catch {
    // The sidebar remains usable when browser storage is unavailable.
  }
}

function getInitials(email: string): string {
  return email.slice(0, 1).toLocaleUpperCase();
}

export function Sidebar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsedPreference(next);
  }

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen max-h-screen shrink-0 flex-col border-e border-border/80 bg-surface transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[5.25rem]' : 'w-64'
      )}
      aria-label="Finora workspace"
      data-collapsed={collapsed}
    >
      <div
        className={cn(
          'flex h-[4.5rem] shrink-0 items-center border-b border-border/70',
          collapsed ? 'justify-center px-2' : 'gap-3 px-5'
        )}
      >
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-3 rounded-lg"
          aria-label="Finora dashboard"
          title={collapsed ? 'Finora dashboard' : undefined}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <span className="font-display text-lg font-bold">F</span>
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block font-display text-lg font-semibold leading-tight tracking-tight text-foreground">
                Finora
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Money, in focus
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav
        id="workspace-navigation"
        aria-label="Primary navigation"
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-5',
          collapsed ? 'px-2' : 'px-3'
        )}
      >
        {!collapsed && (
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            Workspace
          </p>
        )}
        {NAV_ITEMS.map((item) => {
          const active = isPathActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group relative flex min-h-11 items-center rounded-xl text-sm font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                active
                  ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.10)]'
                  : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground'
              )}
            >
              {active && (
                <span
                  className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <Icon
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={active ? 2 : 1.75}
                aria-hidden="true"
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          'shrink-0 border-t border-border/70 py-3',
          collapsed ? 'px-2' : 'px-3'
        )}
      >
        <div className="mb-3">
          <Link
            href="/transactions/new"
            aria-label={collapsed ? 'Add transaction' : undefined}
            title={collapsed ? 'Add transaction' : undefined}
            className={cn(
              'flex min-h-11 items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary-hover hover:shadow-md active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              collapsed ? 'justify-center px-2' : 'gap-3 px-3'
            )}
          >
            <Plus className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {!collapsed && <span>New transaction</span>}
          </Link>
          {!collapsed && (
            <Link
              href="/accounts/new"
              className="mt-1 flex min-h-9 items-center gap-3 rounded-xl px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
              Add an account
            </Link>
          )}
        </div>

        <div
          className={cn(
            'mb-2 flex items-center rounded-xl border border-border/70 bg-background/70',
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {user ? getInitials(user.email) : 'F'}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-foreground">
                {user?.email ?? 'Your profile'}
              </span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {user?.baseCurrency ?? 'Currency'} · Finora
              </span>
            </span>
          )}
        </div>

        <div
          className={cn(
            'flex items-center',
            collapsed ? 'flex-col gap-1' : 'justify-between gap-2'
          )}
        >
          <Link
            href="/settings"
            aria-label={collapsed ? 'Profile and settings' : undefined}
            title={collapsed ? 'Profile and settings' : undefined}
            className={cn(
              'flex h-9 items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              collapsed ? 'w-full justify-center' : 'min-w-0 px-2 text-[11px]'
            )}
          >
            {!collapsed && <span className="truncate">Profile & settings</span>}
            {collapsed && <Settings className="h-4 w-4" aria-hidden="true" />}
          </Link>
          <button
            type="button"
            aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        aria-controls="workspace-navigation"
        onClick={toggleCollapsed}
        className="absolute -end-3 top-[4.5rem] z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:flex"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </aside>
  );
}
