'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/providers/auth-provider';
import type { Account, SavingsGoal } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Target, Loader2, CheckCircle2 } from 'lucide-react';
import { formatMoney, formatDate, parseAmountToMinor } from '@/lib/format';
import { trackScreenOpened, trackGoalCreated } from '@/lib/telemetry';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function SavingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createAccount, setCreateAccount] = useState('');
  const [createTarget, setCreateTarget] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [goalData, accData] = await Promise.all([
        api.savingsGoals.list(),
        api.accounts.list(),
      ]);
      setGoals(goalData);
      setAccounts(accData.filter((a) => a.status === 'ACTIVE'));
    } catch {
      setError("We couldn't load your savings goals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    trackScreenOpened('savings');
  }, [load]);

  const currency = user?.baseCurrency ?? 'USD';
  const savingsAccounts = accounts.filter((a) => a.type === 'SAVINGS');
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const activeGoals = goals.filter((g) => g.status !== 'ARCHIVED');
  const archivedGoals = goals.filter((g) => g.status === 'ARCHIVED');

  async function handleCreate() {
    if (!createName.trim()) {
      toast.error('Please enter a goal name.');
      return;
    }
    if (!createAccount) {
      toast.error('Please select a savings account.');
      return;
    }
    if (!createTarget) {
      toast.error('Please enter a valid target amount.');
      return;
    }
    setCreating(true);
    try {
      const targetMinor = parseAmountToMinor(createTarget, currency);
      if (targetMinor === null) {
        toast.error('Please enter a valid target amount.');
        return;
      }
      await api.savingsGoals.create({
        accountId: createAccount,
        name: createName.trim(),
        targetAmountMinor: targetMinor,
        targetDate: createDate || null,
      });
      trackGoalCreated();
      toast.success('Savings goal created.');
      setCreateOpen(false);
      setCreateName('');
      setCreateAccount('');
      setCreateTarget('');
      setCreateDate('');
      load();
    } catch {
      toast.error('Unable to create savings goal.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Savings Goals"
        description="Track progress toward your savings targets."
        action={
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={savingsAccounts.length === 0}
          >
            <Plus className="me-2 h-4 w-4" />
            New Goal
          </Button>
        }
      />

      {savingsAccounts.length === 0 && !loading && (
        <Card className="mb-6 border-warning/30 bg-warning-muted/30 p-4">
          <p className="text-sm text-warning">
            You need a savings account before creating a goal.{' '}
            <button
              onClick={() => router.push('/accounts/new')}
              className="font-medium underline"
            >
              Create one
            </button>
          </p>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {/* Empty */}
      {!loading && !error && activeGoals.length === 0 && (
        <EmptyState
          icon={Target}
          title="Create your first savings goal"
          description="Set a target and link it to a savings account to track your progress."
          actionLabel="New Goal"
          onAction={() => setCreateOpen(true)}
        />
      )}

      {/* Active goals */}
      {!loading && !error && activeGoals.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {activeGoals.map((goal) => {
            const account = accountMap.get(goal.accountId);
            const isCompleted = goal.status === 'COMPLETED' || goal.progressPercent >= 100;
            return (
              <Card
                key={goal.id}
                className="cursor-pointer p-5 transition-all hover:border-primary/30 hover:shadow-md"
                onClick={() => router.push(`/savings/${goal.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-medium text-foreground">{goal.name}</h3>
                    {account && (
                      <p className="text-xs text-muted-foreground">
                        {account.name}
                      </p>
                    )}
                  </div>
                  {isCompleted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completed
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <Progress
                    value={goal.progressPercent}
                    className={cn('h-2.5', isCompleted && '[&>[data-slot=indicator]]:bg-success')}
                  />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(goal.currentAmountMinor, currency)} of{' '}
                      {formatMoney(goal.targetAmountMinor, currency)}
                    </span>
                    <span className="tabular-nums font-medium text-foreground">
                      {Math.round(goal.progressPercent)}%
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {formatMoney(
                      (BigInt(goal.targetAmountMinor) > BigInt(goal.currentAmountMinor)
                        ? BigInt(goal.targetAmountMinor) - BigInt(goal.currentAmountMinor)
                        : 0n
                      ).toString(),
                      currency
                    )}{' '}
                    remaining
                  </span>
                  {goal.targetDate && (
                    <span>Target: {formatDate(goal.targetDate, 'medium')}</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Archived */}
      {archivedGoals.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Archived
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {archivedGoals.map((goal) => (
              <Card key={goal.id} className="p-5 opacity-60">
                <h3 className="font-medium text-foreground">{goal.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatMoney(goal.currentAmountMinor, currency)} of{' '}
                  {formatMoney(goal.targetAmountMinor, currency)}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New savings goal</DialogTitle>
            <DialogDescription>
              Set a target and link it to a savings account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="goal-name">Goal name</Label>
              <Input
                id="goal-name"
                placeholder="e.g. Emergency Fund, New Laptop"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-account">Linked savings account</Label>
              <Select value={createAccount} onValueChange={setCreateAccount}>
                <SelectTrigger id="goal-account">
                  <SelectValue placeholder="Select a savings account" />
                </SelectTrigger>
                <SelectContent>
                  {savingsAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({formatMoney(a.balanceMinor, a.currencyCode)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-target">Target amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                  {currency}
                </span>
                <Input
                  id="goal-target"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="ps-10 tabular-nums"
                  value={createTarget}
                  onChange={(e) => setCreateTarget(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-date">Target date (optional)</Label>
              <Input
                id="goal-date"
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Create goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
