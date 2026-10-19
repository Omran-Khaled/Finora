'use client';

import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  requestId,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'surface-card flex flex-col items-center justify-center gap-4 rounded-2xl border border-destructive/20 bg-destructive-muted/25 p-8 text-center',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
      {requestId && (
        <p className="text-xs text-muted-foreground/70">Reference: {requestId}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
