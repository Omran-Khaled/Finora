'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import type { Account, Category, Transaction } from '@/lib/types';
import { TransactionTypeIcon } from '@/components/shared/transaction-type-icon';
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
import { ArrowLeft, Pencil, Ban, Loader2 } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function TransactionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const txId = params.id as string;
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  // Transfer context: for TRANSFER transactions we resolve the linked transfer
  // so From/To can be shown clearly instead of a single account.
  const [transferInfo, setTransferInfo] = useState<{
    fromAccountName: string;
    toAccountName: string;
  } | null>(null);

  // Edit form state
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tx = await api.transactions.get(txId);
      if (!tx) {
        setError('Transaction not found.');
        return;
      }
      setTransaction(tx);
      setEditDescription(tx.description ?? '');
      setEditDate(tx.transactionDate);

      const [accs, cats] = await Promise.all([
        api.accounts.list(),
        api.categories.list(),
      ]);
      const acc = accs.find((a) => a.id === tx.accountId);
      setAccount(acc ?? null);
      const cat = cats.find((c) => c.id === tx.categoryId);
      setCategory(cat ?? null);

      // Transfers: resolve the linked transfer to show From and To clearly.
      if (tx.type === 'TRANSFER') {
        setTransferInfo(null);
        const transfer = await api.transfers.get(txId);
        if (!transfer) return;
        const [sourceTx, destTx] = await Promise.all([
          api.transactions.get(transfer.sourceTransactionId),
          api.transactions.get(transfer.destinationTransactionId),
        ]);
        const from = sourceTx
          ? accs.find((a) => a.id === sourceTx.accountId)
          : undefined;
        const to = destTx
          ? accs.find((a) => a.id === destTx.accountId)
          : undefined;
        setTransferInfo({
          fromAccountName: from?.name ?? '—',
          toAccountName: to?.name ?? '—',
        });
      }
    } catch {
      setError("We couldn't load this transaction.");
    } finally {
      setLoading(false);
    }
  }, [txId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!transaction) return;
    setSaving(true);
    try {
      await api.transactions.update(txId, {
        description: editDescription.trim() || null,
        transactionDate: editDate,
      });
      toast.success('Transaction updated.');
      setEditOpen(false);
      load();
    } catch {
      toast.error('Unable to update transaction.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid() {
    setVoiding(true);
    try {
      await api.transactions.void(txId);
      toast.success('Transaction voided.');
      router.push('/transactions');
    } catch {
      toast.error('Unable to void transaction.');
    } finally {
      setVoiding(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="mx-auto max-w-lg">
        <ErrorState
          message={error ?? 'Transaction not found.'}
          onRetry={() => router.push('/transactions')}
        />
      </div>
    );
  }

  const isVoided = transaction.status === 'VOIDED';

  return (
    <div className="mx-auto max-w-lg">
      <button
        onClick={() => router.push('/transactions')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Transactions
      </button>

      {/* Transaction summary */}
      <Card className={cn('p-6', isVoided && 'opacity-60')}>
        <div className="flex items-center gap-4">
          <TransactionTypeIcon type={transaction.type} />
          <div className="flex-1">
            <h1 className="font-display text-lg font-semibold text-foreground">
              {transaction.description || transaction.type.toLowerCase()}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(transaction.transactionDate, 'long')}
            </p>
          </div>
          {isVoided && (
            <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              Voided
            </span>
          )}
        </div>
        <div className="mt-6">
          <p className="text-sm text-muted-foreground">Amount</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-foreground">
            {transaction.type === 'EXPENSE' ? '-' : transaction.type === 'INCOME' ? '+' : ''}
            {formatMoney(transaction.amountMinor, transaction.currencyCode)}
          </p>
        </div>
      </Card>

      {/* Details */}
      <Card className="mt-4 p-6">
        <dl className="space-y-4">
          <div className="flex items-center justify-between">
            <dt className="text-sm text-muted-foreground">Type</dt>
            <dd className="text-sm font-medium text-foreground capitalize">
              {transaction.type.toLowerCase()}
            </dd>
          </div>
          {transferInfo ? (
            <>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">From</dt>
                <dd className="text-sm font-medium text-foreground">
                  {transferInfo.fromAccountName}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">To</dt>
                <dd className="text-sm font-medium text-foreground">
                  {transferInfo.toAccountName}
                </dd>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <dt className="text-sm text-muted-foreground">Account</dt>
              <dd className="text-sm font-medium text-foreground">
                {account?.name ?? '—'}
              </dd>
            </div>
          )}
          {category && (
            <div className="flex items-center justify-between">
              <dt className="text-sm text-muted-foreground">Category</dt>
              <dd className="text-sm font-medium text-foreground">
                {category.name}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-sm text-muted-foreground">Currency</dt>
            <dd className="text-sm font-medium text-foreground">
              {transaction.currencyCode}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-muted-foreground">Date</dt>
            <dd className="text-sm font-medium text-foreground">
              {formatDate(transaction.transactionDate)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-muted-foreground">Status</dt>
            <dd
              className={cn(
                'text-sm font-medium capitalize',
                isVoided ? 'text-muted-foreground' : 'text-success'
              )}
            >
              {transaction.status.toLowerCase()}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Actions — transfers cannot be edited per-leg; they can still be voided */}
      {!isVoided && (
        <div className="mt-6 flex gap-3">
          {transaction.type !== 'TRANSFER' && (
            <Button
              variant="outline"
              onClick={() => setEditOpen(true)}
              className="flex-1"
            >
              <Pencil className="me-2 h-4 w-4" />
              Edit
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="flex-1 text-destructive">
                <Ban className="me-2 h-4 w-4" />
                Void Transaction
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Void this transaction?</AlertDialogTitle>
                <AlertDialogDescription>
                  Voiding marks this transaction as cancelled. It will no
                  longer affect your balances. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleVoid}
                  disabled={voiding}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {voiding && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  Void transaction
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
            <SheetTitle>Edit transaction</SheetTitle>
            <SheetDescription>
              Update the details of this transaction.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Note</Label>
              <Input
                id="edit-description"
                type="text"
                placeholder="Add a note"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
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
