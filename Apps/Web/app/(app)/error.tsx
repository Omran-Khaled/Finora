'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    // Keep the boundary intentionally quiet in production; telemetry remains the source of truth.
  }, []);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center py-12">
      <Card className="surface-card w-full rounded-2xl p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-muted text-warning">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Finora couldn&apos;t finish loading this view. Your saved data is safe; try the operation again.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => reset()}><RefreshCcw className="me-2 h-4 w-4" />Try again</Button>
          <Button variant="outline" onClick={() => router.push('/dashboard')}><ArrowLeft className="me-2 h-4 w-4" />Dashboard</Button>
        </div>
      </Card>
    </div>
  );
}
