'use client';

import { Banknote, Landmark, PiggyBank } from 'lucide-react';
import type { AccountType } from '@/lib/types';
import { cn } from '@/lib/utils';

const CONFIG: Record<
  AccountType,
  { icon: typeof Banknote; label: string; bg: string; text: string }
> = {
  CASH: {
    icon: Banknote,
    label: 'Cash',
    bg: 'bg-warning/10',
    text: 'text-warning',
  },
  BANK: {
    icon: Landmark,
    label: 'Bank',
    bg: 'bg-primary/10',
    text: 'text-primary',
  },
  SAVINGS: {
    icon: PiggyBank,
    label: 'Savings',
    bg: 'bg-success/10',
    text: 'text-success',
  },
};

export function AccountTypeBadge({
  type,
  className,
}: {
  type: AccountType;
  className?: string;
}) {
  const config = CONFIG[type];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        config.bg,
        config.text,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {config.label}
    </span>
  );
}
