'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/providers/auth-provider';
import type { Account } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { Money } from '@/components/shared/money';
import { AccountTypeBadge } from '@/components/shared/account-type-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Wallet, Archive, ArrowRight } from 'lucide-react';
import { trackScreenOpened } from '@/lib/telemetry';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/error';

export default function AccountsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.accounts.list();
      setAccounts(data);
    } catch {
      setError("We couldn't load your accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    trackScreenOpened('accounts');
  }, [loadAccounts]);

  const activeAccounts = accounts.filter((a) => a.status === 'ACTIVE');
  const archivedAccounts = accounts.filter((a) => a.status === 'ARCHIVED');
  const totalBalance = activeAccounts.reduce(
    (sum, a) => sum + BigInt(a.balanceMinor),
    0n
  ).toString();

  async function handleArchive(id: string) {
    try {
      await api.accounts.archive(id);
      toast.success('Account archived.');
      loadAccounts();
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          'Unable to archive account. An account with an active savings goal must stay open until the goal is closed.'
        )
      );
    }
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Manage your cash, bank, and savings accounts."
        action={
          <Button onClick={() => router.push('/accounts/new')}>
            <Plus className="me-2 h-4 w-4" />
            Add Account
          </Button>
        }
      />

      {/* Total balance summary */}
      {!loading && !error && activeAccounts.length > 0 && (
        <Card className="mb-6 border-border/60 bg-surface p-6">
          <p className="text-sm text-muted-foreground">Total Balance</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-foreground">
            <Money
              amountMinor={totalBalance}
              currencyCode={user?.baseCurrency ?? 'USD'}
            />
          </p>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <ErrorState message={error} onRetry={loadAccounts} />
      )}

      {/* Empty state */}
      {!loading && !error && activeAccounts.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="Start by adding your first account"
          description="Create a cash, bank, or savings account to begin tracking your money."
          actionLabel="Add Account"
          onAction={() => router.push('/accounts/new')}
        />
      )}

      {/* Active accounts grid */}
      {!loading && !error && activeAccounts.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeAccounts.map((account) => (
              <Link
                key={account.id}
                href={`/accounts/${account.id}`}
                className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Card className="group cursor-pointer border-border/60 p-5 transition-all hover:border-primary/30 hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-medium text-foreground">{account.name}</h3>
                      <AccountTypeBadge type={account.type} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                  </div>
                  <div className="mt-4">
                    <p className="font-display text-2xl font-semibold tabular-nums text-foreground">
                      <Money
                        amountMinor={account.balanceMinor}
                        currencyCode={account.currencyCode}
                      />
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Archived accounts */}
          {archivedAccounts.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Archived
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {archivedAccounts.map((account) => (
                  <Card
                    key={account.id}
                    className="border-border/40 bg-surface-muted/40 p-5 opacity-70"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-medium text-foreground">
                          {account.name}
                        </h3>
                        <AccountTypeBadge type={account.type} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Archived
                      </span>
                    </div>
                    <div className="mt-4">
                      <p className="font-display text-xl font-semibold tabular-nums text-muted-foreground">
                        <Money
                          amountMinor={account.balanceMinor}
                          currencyCode={account.currencyCode}
                        />
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
