'use client';

import { useEffect } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalRouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the error boundary side-effect free for sensitive application data.
  }, []);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-6 py-16">
      <div className="w-full rounded-3xl border border-border/70 bg-card/90 p-8 text-center shadow-xl shadow-slate-950/5 backdrop-blur">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Finora</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">The page hit an unexpected error. Your financial data was not modified by this screen.</p>
        <Button type="button" onClick={() => reset()} className="mt-6">
          <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </main>
  );
}
