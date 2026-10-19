'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  Home,
  Plus,
  PiggyBank,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { label: 'Budgets', href: '/budgets', icon: PiggyBank },
  { label: 'More', href: '/more', icon: Menu },
];

const MORE_ROUTES = ['/more', '/accounts', '/savings', '/categories', '/settings'];

function isMoreRoute(pathname: string): boolean {
  return MORE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const primaryRouteActive = NAV_ITEMS.slice(0, 3).some(
    (item) =>
      (item.href === '/dashboard'
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`))
  );

  return (
    <>
      {/* Floating add button */}
      <Link
        href="/transactions/new"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] inset-x-0 z-50 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
        aria-label="Add transaction"
        title="Add transaction"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </Link>

      {/* Bottom navigation */}
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center border-t border-border/80 bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_-24px_hsl(var(--foreground)/0.35)] backdrop-blur-xl lg:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/more'
            ? isMoreRoute(pathname) || !primaryRouteActive
            : item.href === '/dashboard'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-[color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground'
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
