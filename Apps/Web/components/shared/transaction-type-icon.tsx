'use client';

import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import type { TransactionType } from '@/lib/types';
import { cn } from '@/lib/utils';

const CONFIG: Record<
  TransactionType,
  { icon: typeof ArrowDownLeft; bg: string; text: string }
> = {
  INCOME: {
    icon: ArrowDownLeft,
    bg: 'bg-success/10',
    text: 'text-success',
  },
  EXPENSE: {
    icon: ArrowUpRight,
    bg: 'bg-destructive/10',
    text: 'text-destructive',
  },
  TRANSFER: {
    icon: ArrowLeftRight,
    bg: 'bg-muted',
    text: 'text-muted-foreground',
  },
};

export function TransactionTypeIcon({
  type,
  className,
}: {
  type: TransactionType;
  className?: string;
}) {
  const config = CONFIG[type];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        config.bg,
        config.text,
        className
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
    </span>
  );
}
