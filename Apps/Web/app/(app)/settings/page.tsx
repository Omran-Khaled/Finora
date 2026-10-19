'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { LogOut, Loader2, Globe, User as UserIcon, Lock, ArrowRight } from 'lucide-react';
import { CURRENCIES } from '@/lib/constants';
import { getInitials } from '@/lib/format';
import { toast } from 'sonner';

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateBaseCurrency, logout } = useAuth();
  const [currency, setCurrency] = useState(user?.baseCurrency ?? 'USD');
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);

  // Base currency is locked once any account exists: all MVP accounts share
  // the user's base currency, so changing it would make balances inconsistent.
  const checkAccounts = useCallback(async () => {
    try {
      const accounts = await api.accounts.list();
      setHasAccounts(accounts.length > 0);
    } catch {
      // If we can't verify, keep the currency editable but the API still guards it.
      setHasAccounts(null);
    }
  }, []);

  useEffect(() => {
    checkAccounts();
  }, [checkAccounts]);

  const currencyLocked = hasAccounts === true;

  async function handleCurrencyChange(value: string) {
    const previous = currency;
    setCurrency(value);
    setSavingCurrency(true);
    try {
      await updateBaseCurrency(value);
      toast.success('Base currency updated.');
    } catch {
      setCurrency(previous);
      toast.error(
        hasAccounts
          ? 'Your base currency cannot be changed because you already have accounts.'
          : 'Unable to update currency. Please try again.'
      );
    } finally {
      setSavingCurrency(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.push('/login');
    } catch {
      toast.error('Unable to sign out.');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Settings"
        description="Manage your profile and preferences."
      />

      {/* Profile */}
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border-2 border-border">
            <AvatarFallback className="bg-primary/10 font-medium text-primary">
              {user ? getInitials(user.email) : 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-foreground">{user?.email}</h3>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your account email
            </p>
          </div>
        </div>
      </Card>

      {/* Base Currency */}
      <Card className="mt-4 p-6">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
            <Globe className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="flex items-center gap-1.5 font-medium text-foreground">
                Base currency
                {currencyLocked && (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                )}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                The primary currency used across your accounts and dashboard.
              </p>
            </div>
            {currencyLocked && (
              <p className="rounded-lg bg-surface-muted/60 px-3 py-2 text-xs text-muted-foreground">
                You have existing accounts, so your base currency is locked. All
                accounts use your base currency to keep balances consistent.
              </p>
            )}
            <div className="relative max-w-xs">
              <Select
                value={currency}
                onValueChange={handleCurrencyChange}
                disabled={savingCurrency || currencyLocked}
              >
                <SelectTrigger aria-label="Base currency">
                  <SelectValue />
                  {savingCurrency && (
                    <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.label} ({c.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {/* Categories link */}
      <Link
        href="/categories"
        className="mt-4 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Card className="cursor-pointer p-6 transition-colors hover:bg-surface-muted/40">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">Categories</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Manage your transaction categories.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </Card>
      </Link>

      {/* Logout */}
      <div className="mt-8 border-t border-border pt-6">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full text-destructive">
              <LogOut className="me-2 h-4 w-4" />
              Sign out
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of Finora?</AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;ll need to sign in again to access your accounts and
                transactions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout} disabled={loggingOut}>
                {loggingOut && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Sign out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
