'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Sidebar } from './sidebar';
import { BottomNav } from './bottom-nav';
import { Skeleton } from '@/components/ui/skeleton';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/70 bg-surface/90 px-4 backdrop-blur-xl lg:hidden">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="font-display text-base font-bold">F</span>
              </div>
              <span className="font-display text-lg font-semibold tracking-tight">
                Finora
              </span>
            </Link>
            <div
              className="h-2 w-2 rounded-full bg-success shadow-[0_0_0_4px_hsl(var(--success)/0.10)]"
              aria-hidden="true"
            />
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-x-hidden pb-20 outline-none lg:pb-0"
          >
            <div
              key={pathname}
              className="page-enter mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-9"
            >
              {children}
            </div>
          </main>
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
