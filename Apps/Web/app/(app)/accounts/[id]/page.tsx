'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import type { Account, Transaction } from '@/lib/types';
import { Money } from '@/components/shared/money';
import { AccountTypeBadge } from '@/components/shared/account-type-badge';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
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
import {
  ArrowLeft,
  Pencil,
  Archive,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/error';

export default function AccountDetailPage() {
  const router = useRouter();
  const params = useParams();
  const accountId = params.id as string;
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, txResult] = await Promise.all([
        api.accounts.get(accountId),
        api.transactions.list({ accountId, limit: 10 }),
      ]);
      if (!acc) {
        setError('Account not found.');
        return;
      }
      setAccount(acc);
      setEditName(acc.name);
      setTransactions(txResult.data);
    } catch {
      setError("We couldn't load this account.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!editName.trim()) {
      toast.error('Account name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await api.accounts.update(accountId, { name: editName.trim() });
      toast.success('Account updated.');
      setEditOpen(false);
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to update account.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await api.accounts.archive(accountId);
      toast.success('Account archived.');
      router.push('/accounts');
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          'Unable to archive account. An account with an active savings goal must stay open until the goal is closed.'
        )
      );
    } finally {
      setArchiving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          message={error ?? 'Account not found.'}
          onRetry={() => router.push('/accounts')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={() => router.push('/accounts')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Accounts
      </button>

      {/* Account summary card */}
      <Card className="border-border/60 p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-xl font-semibold text-foreground">
                {account.name}
              </h1>
              <AccountTypeBadge type={account.type} />
              {account.status === 'ARCHIVED' && (
                <span className="text-xs text-muted-foreground">Archived</span>
              )}
            </div>
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
              <Money
                amountMinor={account.balanceMinor}
                currencyCode={account.currencyCode}
              />
            </p>
            <p className="text-xs text-muted-foreground">
              Opening balance:{' '}
              {formatMoney(account.openingBalanceMinor, account.currencyCode)}
            </p>
          </div>
          {account.status === 'ACTIVE' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setEditOpen(true)}
                aria-label="Edit account"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Recent transactions */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Recent activity</h2>
          {transactions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                router.push(`/transactions?accountId=${account.id}`)
              }
            >
              View all
              <ArrowRight className="ms-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {transactions.length === 0 ? (
          <Card className="border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No transactions for this account yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <Link
                key={tx.id}
                href={`/transactions/${tx.id}`}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Card className="flex items-center justify-between p-4 transition-colors hover:bg-surface-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {tx.description || tx.type.toLowerCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(tx.transactionDate, 'short')}
                      {tx.status === 'VOIDED' && ' · Voided'}
                    </p>
                  </div>
                  <p
                    className={`tabular-nums text-sm font-medium ${
                      tx.type === 'INCOME'
                        ? 'text-success'
                        : tx.type === 'EXPENSE'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {tx.type === 'EXPENSE' ? '-' : tx.type === 'INCOME' ? '+' : ''}
                    {formatMoney(tx.amountMinor, tx.currencyCode)}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Archive action */}
      {account.status === 'ACTIVE' && (
        <div className="mt-8 border-t border-border pt-6">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive">
                <Archive className="me-2 h-4 w-4" />
                Archive account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive this account?</AlertDialogTitle>
                <AlertDialogDescription>
                  Archived accounts are hidden from your active view. Your
                  financial history is preserved. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleArchive}
                  disabled={archiving}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {archiving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  Archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Edit sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit account</SheetTitle>
            <SheetDescription>
              Update the name of this account.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Account name</Label>
              <Input
                id="editName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
