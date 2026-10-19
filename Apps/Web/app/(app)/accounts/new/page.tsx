'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ACCOUNT_TYPES, CURRENCY_MAP } from '@/lib/constants';
import {
  formatAccountType,
  isValidAmountInput,
  parseAmountToMinor,
} from '@/lib/format';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  Banknote,
  Landmark,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import type { AccountType } from '@/lib/types';
import { cn } from '@/lib/utils';

const ACCOUNT_TYPE_ICONS: Record<AccountType, typeof Wallet> = {
  CASH: Banknote,
  BANK: Landmark,
  SAVINGS: PiggyBank,
};

export default function NewAccountPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('BANK');
  // Single-currency MVP: every account uses the user's base currency.
  const baseCurrency = user?.baseCurrency ?? 'USD';
  const [openingBalance, setOpeningBalance] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter an account name.');
      return;
    }
    if (openingBalance && !isValidAmountInput(openingBalance.replace(/,/g, ''), baseCurrency)) {
      toast.error(`Please enter a valid opening balance for ${baseCurrency}.`);
      return;
    }
    setLoading(true);
    try {
      const balanceMinor = parseAmountToMinor(openingBalance || '0', baseCurrency, { allowZero: true });
      if (balanceMinor === null) {
        toast.error('Please enter a valid opening balance.');
        return;
      }
      await api.accounts.create({
        name: name.trim(),
        type,
        currencyCode: baseCurrency,
        openingBalanceMinor: balanceMinor,
      });
      toast.success('Account created.');
      router.push('/accounts');
    } catch {
      toast.error('Unable to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <button
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <h1 className="font-display text-2xl font-semibold tracking-tight">
        New Account
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a new cash, bank, or savings account.
      </p>

      <Card className="mt-6 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Account type</Label>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map((t) => {
                const Icon = ACCOUNT_TYPE_ICONS[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={active}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      active
                        ? 'border-primary bg-primary/8 text-primary shadow-sm'
                        : 'border-border bg-surface text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-6 w-6" strokeWidth={1.5} />
                    <span className="text-xs font-medium">
                      {formatAccountType(t)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Account name</Label>
            <Input
              id="name"
              placeholder="e.g. Main Bank, Cash Wallet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Currency</Label>
            {/* Single-currency MVP: accounts always use the base currency. */}
            <div className="rounded-xl border border-border bg-surface-muted/40 px-4 py-3 text-sm">
              <span className="font-medium text-foreground">{baseCurrency}</span>
              <span className="text-muted-foreground">
                {' '}
                — {CURRENCY_MAP[baseCurrency]?.label ?? baseCurrency} (your base
                currency)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              All accounts use your base currency to keep balances consistent.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="openingBalance">Opening balance</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                {CURRENCY_MAP[baseCurrency]?.symbol ?? baseCurrency}
              </span>
              <Input
                id="openingBalance"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className="ps-8 tabular-nums"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use a transaction later if the balance changes after setup.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            Create account
          </Button>
        </form>
      </Card>
    </div>
  );
}
