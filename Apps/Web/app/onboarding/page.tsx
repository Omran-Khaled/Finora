'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { api } from '@/lib/api-client';
import { AuthLayout } from '@/components/shared/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENCIES, ACCOUNT_TYPES } from '@/lib/constants';
import { formatAccountType, parseAmountToMinor } from '@/lib/format';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  Landmark,
  Loader2,
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

export default function OnboardingPage() {
  const router = useRouter();
  const { user, updateBaseCurrency, setOnboardingComplete, hasCompletedOnboarding } =
    useAuth();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState(user?.baseCurrency ?? 'USD');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('BANK');
  const [openingBalance, setOpeningBalance] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasCompletedOnboarding) {
      router.replace('/dashboard');
    }
  }, [hasCompletedOnboarding, router]);

  function handleSkipSetup() {
    setOnboardingComplete();
    toast.success('You can add your first account anytime from your dashboard.');
  }

  async function handleCreateAccount() {
    if (!accountName.trim()) {
      toast.error('Enter a name for your account to continue.');
      return;
    }
    if (!currency) {
      toast.error('Choose your base currency to continue.');
      return;
    }
    const balanceMinor = parseAmountToMinor(openingBalance || '0', currency, {
      allowZero: true,
    });
    if (balanceMinor === null) {
      toast.error(`Enter a valid opening balance in ${currency}, such as 0.00.`);
      return;
    }

    setLoading(true);
    try {
      // An account must use the user's base currency. Update the profile before
      // creating the account, while the account-currency invariant remains intact.
      await updateBaseCurrency(currency);
      await api.accounts.create({
        name: accountName.trim(),
        type: accountType,
        currencyCode: currency,
        openingBalanceMinor: balanceMinor,
      });
      setOnboardingComplete();
      toast.success('Your first account is ready.');
    } catch {
      toast.error(
        'We couldn’t finish setup. Check your details and try again, or skip for now and add an account later.',
      );
    } finally {
      setLoading(false);
    }
  }

  const steps = ['Currency', 'First account'];

  return (
    <AuthLayout>
      <section className="rounded-3xl border border-border/80 bg-card/90 p-6 shadow-[var(--shadow-card)] backdrop-blur sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Your setup, your pace
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Make Finora yours
            </h1>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleSkipSetup}
            disabled={loading}
          >
            Skip for now
          </Button>
        </div>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Choose a currency and, if you’re ready, add an account. You can also
          head straight to your dashboard and set this up later.
        </p>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs font-medium">
            <span className="text-foreground">Step {step + 1} of {steps.length}</span>
            <span className="text-muted-foreground">{steps[step]}</span>
          </div>
          <div
            className="flex gap-2"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={step + 1}
            aria-valuetext={`${steps[step]}, step ${step + 1} of ${steps.length}`}
          >
            {steps.map((label, index) => (
              <span
                key={label}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors duration-300',
                  index <= step ? 'bg-primary' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div key="currency-step" className="mt-8 space-y-6 animate-in-subtle">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Choose your base currency
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                This is the shared currency for your account balances and
                financial overview.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Base currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency" className="h-12 rounded-xl">
                  <SelectValue placeholder="Select a currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.code} — {item.label} ({item.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/[0.045] p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-xs leading-5 text-muted-foreground">
                  Once you add an account, its currency matches your base
                  currency so your totals stay consistent.
                </p>
              </div>
            </div>

            <Button
              type="button"
              className="h-12 w-full rounded-xl"
              onClick={() => setStep(1)}
              disabled={!currency}
            >
              Continue
              <ArrowRight className="ms-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div key="account-step" className="mt-8 space-y-6 animate-in-subtle">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Add your first account
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Start with one account you want to keep in view. You can add
                more at any time.
              </p>
            </div>

            <div className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Account type</legend>
                <div className="grid grid-cols-3 gap-2">
                  {ACCOUNT_TYPES.map((type) => {
                    const Icon = ACCOUNT_TYPE_ICONS[type];
                    const active = accountType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setAccountType(type)}
                        aria-pressed={active}
                        className={cn(
                          'flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-[transform,border-color,background-color,color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                          active
                            ? 'border-primary bg-primary/[0.07] text-primary shadow-sm'
                            : 'border-border bg-surface text-muted-foreground hover:border-primary/35 hover:text-foreground',
                        )}
                      >
                        <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                        <span className="text-xs font-medium">
                          {formatAccountType(type)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="accountName">Account name</Label>
                <Input
                  id="accountName"
                  placeholder="e.g. Everyday bank"
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  autoComplete="off"
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="openingBalance">Opening balance (optional)</Label>
                <div className="relative">
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                    {CURRENCIES.find((item) => item.code === currency)?.symbol}
                  </span>
                  <Input
                    id="openingBalance"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-11 rounded-xl ps-9 tabular-nums"
                    value={openingBalance}
                    onChange={(event) => setOpeningBalance(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setStep(0)}
                disabled={loading}
              >
                <ArrowLeft className="me-2 h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl sm:flex-1"
                onClick={handleCreateAccount}
                disabled={loading || !accountName.trim()}
              >
                {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </AuthLayout>
  );
}
