import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

interface MoneyProps {
  amountMinor: string;
  currencyCode: string;
  className?: string;
  showSign?: boolean;
  showSymbol?: boolean;
  showCode?: boolean;
  signed?: 'positive' | 'negative' | 'auto';
}

export function Money({
  amountMinor,
  currencyCode,
  className,
  showSign = false,
  showSymbol = true,
  showCode = false,
  signed,
}: MoneyProps) {
  const formatted = formatMoney(amountMinor, currencyCode, { showSymbol, showCode });
  const numericAmount = BigInt(amountMinor);
  const isNegative = numericAmount < BigInt(0);
  const isPositive = numericAmount > BigInt(0);

  let colorClass = 'text-foreground';
  if (signed === 'positive' && isPositive) colorClass = 'text-success';
  if (signed === 'negative' && isNegative) colorClass = 'text-destructive';
  if (signed === 'auto') {
    if (isPositive) colorClass = 'text-success';
    if (isNegative) colorClass = 'text-destructive';
  }

  const sign = showSign ? (isNegative ? '-' : '+') : '';

  return (
    <span className={cn('tabular-nums', colorClass, className)}>
      {sign}
      {formatted}
    </span>
  );
}
