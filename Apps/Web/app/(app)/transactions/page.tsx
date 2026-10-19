'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import type { Account, Category, Transaction, TransactionType } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { TransactionTypeIcon } from '@/components/shared/transaction-type-icon';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, ArrowLeftRight, Loader2, Filter, X } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import { trackScreenOpened } from '@/lib/telemetry';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: 'Income',
  EXPENSE: 'Expense',
  TRANSFER: 'Transfer',
};

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Filters
  const [filterAccount, setFilterAccount] = useState<string>(
    searchParams.get('accountId') ?? 'all'
  );
  const [filterType, setFilterType] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txResult, accs, cats] = await Promise.all([
        api.transactions.list({
          accountId: filterAccount !== 'all' ? filterAccount : undefined,
          type: filterType !== 'all' ? (filterType as TransactionType) : undefined,
          limit: 20,
        }),
        api.accounts.list(),
        api.categories.list(),
      ]);
      setTransactions(txResult.data);
      setNextCursor(txResult.meta.nextCursor);
      setAccounts(accs.filter((a) => a.status === 'ACTIVE'));
      setCategories(cats.filter((c) => c.status === 'ACTIVE'));
    } catch {
      setError("We couldn't load your transactions.");
    } finally {
      setLoading(false);
    }
  }, [filterAccount, filterType]);

  useEffect(() => {
    load();
    trackScreenOpened('transactions');
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const result = await api.transactions.list({
        accountId: filterAccount !== 'all' ? filterAccount : undefined,
        type: filterType !== 'all' ? (filterType as TransactionType) : undefined,
        cursor: nextCursor,
        limit: 20,
      });
      setTransactions((prev) => [...prev, ...result.data]);
      setNextCursor(result.meta.nextCursor);
    } catch {
      // Surface the failure — the cursor is kept so "Load more" can be retried.
      toast.error('Unable to load more transactions. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  }

  const hasFilters = filterAccount !== 'all' || filterType !== 'all';

  function clearFilters() {
    setFilterAccount('all');
    setFilterType('all');
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="All your income, expenses, and transfers."
        action={
          <Button onClick={() => router.push('/transactions/new')}>
            <Plus className="me-2 h-4 w-4" />
            Add Transaction
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Filter</span>
        </div>
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="me-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {/* Empty */}
      {!loading && !error && transactions.length === 0 && hasFilters && (
        <EmptyState
          icon={Filter}
          title="No transactions match your filters"
          description="Try adjusting or clearing your filters to see more results."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      )}
      {!loading && !error && transactions.length === 0 && !hasFilters && (
        <EmptyState
          icon={ArrowLeftRight}
          title="No transactions yet"
          description="Add your first transaction to start tracking your income and expenses."
          actionLabel="Add Transaction"
          onAction={() => router.push('/transactions/new')}
        />
      )}

      {/* List */}
      {!loading && !error && transactions.length > 0 && (
        <div className="space-y-2">
          {transactions.map((tx) => {
            const account = accountMap.get(tx.accountId);
            const category = tx.categoryId
              ? categoryMap.get(tx.categoryId)
              : null;
            return (
              <Link
                key={tx.id}
                href={`/transactions/${tx.id}`}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Card className="flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-surface-muted/40">
                  <TransactionTypeIcon type={tx.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {tx.description || TYPE_LABELS[tx.type]}
                      </p>
                      {tx.status === 'VOIDED' && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Voided
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(tx.transactionDate, 'short')}
                      {account && ` · ${account.name}`}
                      {category && ` · ${category.name}`}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'shrink-0 tabular-nums text-sm font-semibold',
                      tx.type === 'INCOME' && 'text-success',
                      tx.type === 'EXPENSE' && 'text-foreground',
                      tx.type === 'TRANSFER' && 'text-muted-foreground',
                      tx.status === 'VOIDED' && 'opacity-50'
                    )}
                  >
                    {tx.type === 'EXPENSE' ? '-' : tx.type === 'INCOME' ? '+' : ''}
                    {formatMoney(tx.amountMinor, tx.currencyCode)}
                  </p>
                </Card>
              </Link>
            );
          })}

          {/* Load more */}
          {nextCursor && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
