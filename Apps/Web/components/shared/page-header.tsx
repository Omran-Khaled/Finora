'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'page-header relative mb-6 flex flex-col gap-4 overflow-hidden rounded-2xl border border-border/80 bg-card px-5 py-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6',
        className
      )}
    >
      <div className="relative min-w-0 space-y-1.5">
        <span className="absolute -start-5 top-1 h-8 w-1 rounded-full bg-primary sm:-start-6" aria-hidden="true" />
        <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-foreground sm:text-[1.85rem]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          {action}
        </div>
      )}
    </div>
  );
}
