'use client';

import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'surface-card relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-dashed border-border bg-surface-muted/35 p-10 text-center',
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/8 text-primary">
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5">
        <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="default" className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
