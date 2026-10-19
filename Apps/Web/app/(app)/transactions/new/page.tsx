'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import type { Account, Category, TransactionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CURRENCIES } from '@/lib/constants';
import { parseAmountToMinor, formatMoney, isValidAmountInput } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/error';
import { trackTransactionCreated } from '@/lib/telemetry';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

export default function NewTransactionPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('EXPENSE');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [accs, cats] = await Promise.all([
        api.accounts.list(),
        api.categories.list(),
      ]);
      const active = accs.filter((a) => a.status === 'ACTIVE');
      setAccounts(active);
      setCategories(cats.filter((c) => c.status === 'ACTIVE'));
      if (active.length > 0) setAccountId(active[0].id);
    } catch {
      toast.error('Unable to load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedCurrency = selectedAccount?.currencyCode ?? 'USD';
  const currencySymbol =
    CURRENCIES.find((c) => c.code === selectedCurrency)?.symbol ?? '$';

  // Filter categories for expense/income tabs
  const relevantCategories = categories.filter((c) => c.type === tab);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const amountMinor = parseAmountToMinor(amount, selectedCurrency);
    if (amountMinor === null) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (!accountId) {
      toast.error('Please select an account.');
      return;
    }
    if (tab === 'EXPENSE' && !categoryId) {
      toast.error('Please select a category for this expense.');
      return;
    }
    if (tab === 'TRANSFER') {
      if (!toAccountId) {
        toast.error('Please select a destination account.');
        return;
      }
      if (accountId === toAccountId) {
        toast.error('Source and destination must be different accounts.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (tab === 'TRANSFER') {
        await api.transfers.create({
          fromAccountId: accountId,
          toAccountId,
          amountMinor,
          transactionDate: date,
        });
        trackTransactionCreated('TRANSFER');
        toast.success('Transfer completed.');
      } else {
        await api.transactions.create({
          type: tab,
          accountId,
          categoryId: tab === 'EXPENSE' ? categoryId : categoryId || null,
          amountMinor,
          description: description.trim() || null,
          transactionDate: date,
        });
        trackTransactionCreated(tab);
        toast.success(
          tab === 'EXPENSE' ? 'Expense recorded.' : 'Income recorded.'
        );
      }
      router.push('/transactions');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Unable to save transaction. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            You need an account before adding transactions.
          </p>
          <Button
            className="mt-4"
            onClick={() => router.push('/accounts/new')}
          >
            Create an account
          </Button>
        </Card>
      </div>
    );
  }

  const TAB_CONFIG: {
    key: TabType;
    label: string;
    icon: typeof ArrowUpRight;
  }[] = [
    { key: 'EXPENSE', label: 'Expense', icon: ArrowUpRight },
    { key: 'INCOME', label: 'Income', icon: ArrowDownLeft },
    { key: 'TRANSFER', label: 'Transfer', icon: ArrowLeftRight },
  ];

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
        Add Transaction
      </h1>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabType)}
        className="mt-6"
      >
        <TabsList className="grid w-full grid-cols-3">
          {TAB_CONFIG.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="flex items-center gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <form onSubmit={handleSubmit}>
          {/* Expense tab */}
          <TabsContent value="EXPENSE">
            <TransactionFormBody
              amount={amount}
              setAmount={setAmount}
              currencySymbol={currencySymbol}
              accounts={accounts}
              accountId={accountId}
              setAccountId={setAccountId}
              categories={relevantCategories}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              categoryRequired
              description={description}
              setDescription={setDescription}
              date={date}
              setDate={setDate}
              submitting={submitting}
            />
          </TabsContent>

          {/* Income tab */}
          <TabsContent value="INCOME">
            <TransactionFormBody
              amount={amount}
              setAmount={setAmount}
              currencySymbol={currencySymbol}
              accounts={accounts}
              accountId={accountId}
              setAccountId={setAccountId}
              categories={relevantCategories}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              categoryRequired={false}
              description={description}
              setDescription={setDescription}
              date={date}
              setDate={setDate}
              submitting={submitting}
            />
          </TabsContent>

          {/* Transfer tab */}
          <TabsContent value="TRANSFER">
            <Card className="p-6">
              <div className="space-y-5">
                {/* Amount — the most important field */}
                <div className="space-y-2">
                  <Label htmlFor="transfer-amount">Amount</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-2xl font-medium text-muted-foreground">
                      {currencySymbol}
                    </span>
                    <Input
                      id="transfer-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-14 ps-12 text-2xl font-medium tabular-nums"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                </div>

                {/* From account */}
                <div className="space-y-2">
                  <Label htmlFor="from-account">From account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="from-account">
                      <SelectValue placeholder="Select source account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({formatMoney(a.balanceMinor, a.currencyCode, { showSymbol: true })})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* To account */}
                <div className="space-y-2">
                  <Label htmlFor="to-account">To account</Label>
                  <Select value={toAccountId} onValueChange={setToAccountId}>
                    <SelectTrigger id="to-account">
                      <SelectValue placeholder="Select destination account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((a) => a.id !== accountId)
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} ({formatMoney(a.balanceMinor, a.currencyCode, { showSymbol: true })})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {accounts.length > 1 &&
                    accountId === toAccountId &&
                    toAccountId && (
                      <p className="text-xs text-destructive">
                        Source and destination must be different.
                      </p>
                    )}
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label htmlFor="transfer-date">Date</Label>
                  <Input
                    id="transfer-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !amount || !accountId || !toAccountId}
                >
                  {submitting ? (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="me-2 h-4 w-4" />
                  )}
                  Confirm transfer
                </Button>
              </div>
            </Card>
          </TabsContent>
        </form>
      </Tabs>
    </div>
  );
}

// Shared form body for Expense and Income tabs
function TransactionFormBody({
  amount,
  setAmount,
  currencySymbol,
  accounts,
  accountId,
  setAccountId,
  categories,
  categoryId,
  setCategoryId,
  categoryRequired,
  description,
  setDescription,
  date,
  setDate,
  submitting,
}: {
  amount: string;
  setAmount: (v: string) => void;
  currencySymbol: string;
  accounts: Account[];
  accountId: string;
  setAccountId: (v: string) => void;
  categories: Category[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  categoryRequired: boolean;
  description: string;
  setDescription: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  submitting: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="space-y-5">
        {/* Amount — the most important field */}
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-2xl font-medium text-muted-foreground">
              {currencySymbol}
            </span>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className="h-14 ps-12 text-2xl font-medium tabular-nums"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        {/* Account */}
        <div className="space-y-2">
          <Label htmlFor="account">Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="account">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category">
            Category {categoryRequired ? '' : '(optional)'}
          </Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="category">
              <SelectValue
                placeholder={categoryRequired ? 'Select category' : 'Optional'}
              />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.isSystem && ' (system)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date */}
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Note */}
        <div className="space-y-2">
          <Label htmlFor="description">Note (optional)</Label>
          <Input
            id="description"
            type="text"
            placeholder="Add a note"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting || !amount}>
          {submitting ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="me-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </Card>
  );
}
