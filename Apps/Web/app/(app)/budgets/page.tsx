'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/providers/auth-provider';
import type { Budget, Category } from '@/lib/types';
import { minorToDisplay } from '@/lib/format';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, PiggyBank, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { formatMoney, formatMonthYear, parseAmountToMinor } from '@/lib/format';
import { MONTHS } from '@/lib/constants';
import { trackScreenOpened, trackBudgetCreated } from '@/lib/telemetry';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function BudgetsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState('');
  const [createLimit, setCreateLimit] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [editLimit, setEditLimit] = useState('');
  const [editing, setEditing] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // Current month/year context
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgetData, catData] = await Promise.all([
        api.budgets.list(),
        api.categories.list(),
      ]);
      setBudgets(budgetData);
      setCategories(catData.filter((c) => c.status === 'ACTIVE'));
    } catch {
      setError("We couldn't load your budgets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    trackScreenOpened('budgets');
  }, [load]);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const currency = user?.baseCurrency ?? 'USD';

  // Filter budgets by selected month
  const monthBudgets = budgets.filter(
    (b) => b.year === selectedYear && b.month === selectedMonth
  );

  // Categories that don't have a budget yet for this month
  const availableCategories = categories.filter(
    (c) =>
      c.type === 'EXPENSE' &&
      !monthBudgets.some((b) => b.categoryId === c.id)
  );

  async function handleCreate() {
    if (!createCategory) {
      toast.error('Please select a category.');
      return;
    }
    if (!createLimit) {
      toast.error('Please enter a valid budget limit.');
      return;
    }
    setCreating(true);
    try {
      const limitMinor = parseAmountToMinor(createLimit, currency);
      if (limitMinor === null) {
        toast.error('Please enter a valid budget limit.');
        return;
      }
      await api.budgets.create({
        categoryId: createCategory,
        year: selectedYear,
        month: selectedMonth,
        limitMinor,
      });
      trackBudgetCreated();
      toast.success('Budget created.');
      setCreateOpen(false);
      setCreateCategory('');
      setCreateLimit('');
      load();
    } catch {
      toast.error('A budget for this category already exists this month.');
    } finally {
      setCreating(false);
    }
  }

  async function handleEditSave() {
    if (!editBudget) return;
    if (!editLimit) {
      toast.error('Please enter a valid budget limit.');
      return;
    }
    setEditing(true);
    try {
      const limitMinor = parseAmountToMinor(editLimit, currency);
      if (limitMinor === null) {
        toast.error('Please enter a valid budget limit.');
        return;
      }
      await api.budgets.update(editBudget.id, { limitMinor });
      toast.success('Budget updated.');
      setEditBudget(null);
      load();
    } catch {
      toast.error('Unable to update budget.');
    } finally {
      setEditing(false);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeletePending(true);
    try {
      await api.budgets.delete(deletingId);
      toast.success('Budget deleted.');
      setDeletingId(null);
      load();
    } catch {
      toast.error('Unable to delete budget.');
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="Set monthly spending limits per category."
        action={
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={availableCategories.length === 0}
          >
            <Plus className="me-2 h-4 w-4" />
            Create Budget
          </Button>
        }
      />

      {/* Month selector */}
      <div className="mb-6 flex items-center gap-3">
        <Select
          value={String(selectedMonth)}
          onValueChange={(v) => setSelectedMonth(Number(v))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(selectedYear)}
          onValueChange={(v) => setSelectedYear(Number(v))}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(
              (y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {/* Empty */}
      {!loading && !error && monthBudgets.length === 0 && (
        <EmptyState
          icon={PiggyBank}
          title="No budgets set for this month"
          description="Create a budget to track your spending limits per category."
          actionLabel="Create Budget"
          onAction={() => setCreateOpen(true)}
        />
      )}

      {/* Budget list */}
      {!loading && !error && monthBudgets.length > 0 && (
        <div className="space-y-3">
          {monthBudgets.map((budget) => {
            const cat = categoryMap.get(budget.categoryId);
            const progress = BigInt(budget.limitMinor) > BigInt(0)
              ? Number((BigInt(budget.spentMinor) * 10000n / BigInt(budget.limitMinor)).toString()) / 100
              : 0;
            const exceeded = BigInt(budget.spentMinor) > BigInt(budget.limitMinor);
            const remaining = budget.remainingMinor;

            return (
              <Card key={budget.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground">
                      {cat?.name ?? 'Unknown'}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatMoney(budget.spentMinor, currency)} spent of{' '}
                      {formatMoney(budget.limitMinor, currency)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditBudget(budget);
                        setEditLimit(minorToDisplay(budget.limitMinor, currency));
                      }}
                      aria-label="Edit budget"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog
                      open={deletingId === budget.id}
                      onOpenChange={(open) =>
                        setDeletingId(open ? budget.id : null)
                      }
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label="Delete budget"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this budget?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This budget for {cat?.name} in{' '}
                            {formatMonthYear(budget.year, budget.month)} will be
                            permanently removed. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deletePending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deletePending && (
                              <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            )}
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="mt-4">
                  <Progress
                    value={Math.min(progress, 100)}
                    className={cn(
                      'h-2.5',
                      exceeded && '[&>[data-slot=indicator]]:bg-destructive'
                    )}
                  />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    {exceeded ? (
                      <span className="flex items-center gap-1 font-medium text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Budget exceeded
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {formatMoney(
                          (BigInt(remaining) < BigInt(0) ? -BigInt(remaining) : BigInt(remaining)).toString(),
                          currency
                        )} remaining
                      </span>
                    )}
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round(progress)}%
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create budget</DialogTitle>
            <DialogDescription>
              Set a spending limit for {formatMonthYear(selectedYear, selectedMonth)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="budget-category">Category</Label>
              <Select value={createCategory} onValueChange={setCreateCategory}>
                <SelectTrigger id="budget-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-limit">Monthly limit</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                  {currency}
                </span>
                <Input
                  id="budget-limit"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="ps-10 tabular-nums"
                  value={createLimit}
                  onChange={(e) => setCreateLimit(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Create budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editBudget !== null}
        onOpenChange={(open) => !open && setEditBudget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit budget</DialogTitle>
            <DialogDescription>
              Update the spending limit for{' '}
              {editBudget
                ? categoryMap.get(editBudget.categoryId)?.name
                : ''}{' '}
              in{' '}
              {editBudget
                ? formatMonthYear(editBudget.year, editBudget.month)
                : ''}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-limit">Monthly limit</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                  {currency}
                </span>
                <Input
                  id="edit-limit"
                  type="text"
                  inputMode="decimal"
                  className="ps-10 tabular-nums"
                  value={editLimit}
                  onChange={(e) => setEditLimit(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBudget(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editing}>
              {editing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
