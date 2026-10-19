'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/providers/auth-provider';
import type { Account, SavingsGoal } from '@/lib/types';
import { Money } from '@/components/shared/money';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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
import { ArrowLeft, Pencil, Archive, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function SavingsGoalDetailPage() {
  const router = useRouter();
  const params = useParams();
  const goalId = params.id as string;
  const { user } = useAuth();
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit (rename-only: PATCH /savings-goals/:id accepts `name` alone)
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const g = await api.savingsGoals.get(goalId);
      if (!g) {
        setError('Savings goal not found.');
        return;
      }
      setGoal(g);
      setEditName(g.name);
      const accs = await api.accounts.list();
      setAccount(accs.find((a) => a.id === g.accountId) ?? null);
    } catch {
      setError("We couldn't load this savings goal.");
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!goal) return;
    if (!editName.trim()) {
      toast.error('Goal name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await api.savingsGoals.update(goalId, {
        name: editName.trim(),
      });
      toast.success('Goal updated.');
      setEditOpen(false);
      load();
    } catch {
      toast.error('Unable to update goal.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await api.savingsGoals.archive(goalId);
      toast.success('Goal archived.');
      router.push('/savings');
    } catch {
      toast.error('Unable to archive goal.');
    } finally {
      setArchiving(false);
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

  if (error || !goal) {
    return (
      <div className="mx-auto max-w-lg">
        <ErrorState
          message={error ?? 'Goal not found.'}
          onRetry={() => router.push('/savings')}
        />
      </div>
    );
  }

  const currency = account?.currencyCode ?? user?.baseCurrency ?? 'USD';
  const isCompleted = goal.status === 'COMPLETED' || goal.progressPercent >= 100;
  const remaining = (BigInt(goal.targetAmountMinor) - BigInt(goal.currentAmountMinor)).toString();

  return (
    <div className="mx-auto max-w-lg">
      <button
        onClick={() => router.push('/savings')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Savings Goals
      </button>

      {/* Goal summary */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="font-display text-xl font-semibold text-foreground">
              {goal.name}
            </h1>
            {account && (
              <button
                onClick={() => router.push(`/accounts/${account.id}`)}
                className="text-sm text-primary hover:underline"
              >
                {account.name}
                <ArrowRight className="ms-1 inline h-3 w-3" />
              </button>
            )}
          </div>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </span>
          ) : goal.status === 'ARCHIVED' ? (
            <span className="text-xs text-muted-foreground">Archived</span>
          ) : null}
        </div>

        <div className="mt-6">
          <Progress
            value={goal.progressPercent}
            className={cn('h-3', isCompleted && '[&>[data-slot=indicator]]:bg-success')}
          />
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="font-display text-2xl font-semibold tabular-nums text-foreground">
                <Money amountMinor={goal.currentAmountMinor} currencyCode={currency} />
              </p>
              <p className="text-sm text-muted-foreground">
                of{' '}
                <Money
                  amountMinor={goal.targetAmountMinor}
                  currencyCode={currency}
                />{' '}
                target
              </p>
            </div>
            <p className="font-display text-2xl font-semibold tabular-nums text-primary">
              {Math.round(goal.progressPercent)}%
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">
            {BigInt(remaining) > 0n
              ? `${formatMoney(remaining, currency)} remaining`
              : 'Goal reached!'}
          </span>
          {goal.targetDate && (
            <span className="text-muted-foreground">
              Target: {formatDate(goal.targetDate, 'long')}
            </span>
          )}
        </div>
      </Card>

      {/* Actions */}
      {goal.status === 'ACTIVE' && (
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            className="flex-1"
          >
            <Pencil className="me-2 h-4 w-4" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="flex-1 text-destructive">
                <Archive className="me-2 h-4 w-4" />
                Archive
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive this savings goal?</AlertDialogTitle>
                <AlertDialogDescription>
                  The goal will be moved to your archived list. Your linked
                  savings account is not affected.
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
            <SheetTitle>Edit savings goal</SheetTitle>
            <SheetDescription>
              Update the name of this goal. The target amount and date are set
              when the goal is created.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Goal name</Label>
              <Input
                id="edit-name"
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
