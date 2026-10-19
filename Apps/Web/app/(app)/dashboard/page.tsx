"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useAuth } from "@/components/providers/auth-provider";
import type { DashboardSummary, Transaction, Account } from "@/lib/types";
import { Money } from "@/components/shared/money";
import { TransactionTypeIcon } from "@/components/shared/transaction-type-icon";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Wallet,
  Target,
  PiggyBank,
  Plus,
  Sparkles,
  CreditCard,
  TrendingUp,
  CircleDollarSign,
  ReceiptText,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  formatAccountType,
  formatMoney,
  formatDate,
  formatMonthYear,
  getGreeting,
  getInitials,
} from "@/lib/format";
import { trackScreenOpened } from "@/lib/telemetry";
import { cn } from "@/lib/utils";
import { isAccountType } from "@/lib/constants";
import { ERROR_CODES, type ClientErrorCode } from "@finora/contracts";

function pct(spent: bigint, limit: bigint) {
  if (limit <= 0n) return 0;
  const value = Number((spent * 10000n) / limit) / 100;
  return Math.max(0, Math.min(100, value));
}

interface DashboardLoadError {
  message: string;
  code?: ClientErrorCode;
  requestId?: string;
  diagnostic?: string;
  unauthorized: boolean;
}

type DashboardRequestSource = "summary" | "recent transactions" | "accounts";

class DashboardRequestFailure extends Error {
  readonly source: DashboardRequestSource;
  readonly originalError: unknown;

  constructor(source: DashboardRequestSource, originalError: unknown) {
    super("Dashboard request failed.");
    this.name = "DashboardRequestFailure";
    this.source = source;
    this.originalError = originalError;
  }
}

class DashboardResponseValidationError extends Error {
  readonly path: string;

  constructor(path: string) {
    super("Dashboard response validation failed.");
    this.name = "DashboardResponseValidationError";
    this.path = path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClientErrorCode(value: unknown): value is ClientErrorCode {
  return (
    typeof value === "string" &&
    (value === "NETWORK_ERROR" || ERROR_CODES.some((code) => code === value))
  );
}

function getDashboardLoadError(error: unknown): DashboardLoadError {
  const source =
    error instanceof DashboardRequestFailure ? error.source : undefined;
  const originalError =
    error instanceof DashboardRequestFailure ? error.originalError : error;
  const requestDiagnostic = source
    ? `Dashboard request: ${source}.`
    : undefined;

  if (originalError instanceof DashboardResponseValidationError) {
    return {
      message: "The dashboard response contains invalid data.",
      diagnostic: `Invalid response field: ${originalError.path}.`,
      unauthorized: false,
    };
  }

  if (originalError instanceof TypeError) {
    return {
      message:
        "We couldn't reach the Finora service. Check your internet connection and try again.",
      diagnostic: requestDiagnostic,
      unauthorized: false,
    };
  }

  if (
    originalError instanceof Error &&
    originalError.message === "Request timed out"
  ) {
    return {
      message: "The Finora service took too long to respond. Please try again.",
      diagnostic: requestDiagnostic,
      unauthorized: false,
    };
  }

  if (
    isRecord(originalError) &&
    isRecord(originalError.error) &&
    isClientErrorCode(originalError.error.code) &&
    typeof originalError.error.message === "string" &&
    typeof originalError.error.requestId === "string"
  ) {
    const { code, message, requestId } = originalError.error;
    const unauthorized = code === "UNAUTHORIZED";

    return {
      code,
      message:
        code === "NETWORK_ERROR"
          ? "We couldn't reach the Finora service. Check your internet connection and try again."
          : unauthorized
            ? `${message} Your session may have expired. Sign in again to continue.`
            : message,
      requestId,
      diagnostic: requestDiagnostic,
      unauthorized,
    };
  }

  return {
    message: "We couldn't load your financial summary.",
    diagnostic: requestDiagnostic,
    unauthorized: false,
  };
}

function requireMinorAmount(value: unknown, path: string): void {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    throw new DashboardResponseValidationError(path);
  }
}

function requireMinorField(
  record: unknown,
  field: string,
  path: string,
): void {
  if (!isRecord(record)) {
    throw new DashboardResponseValidationError(path);
  }
  requireMinorAmount(record[field], path);
}

function validateDashboardFinancialData(
  summary: unknown,
  recentTransactions: unknown,
  accounts: unknown,
): void {
  if (!isRecord(summary)) {
    throw new DashboardResponseValidationError("summary");
  }

  if (!Array.isArray(summary.budgets)) {
    throw new DashboardResponseValidationError("summary.budgets");
  }
  if (!Array.isArray(summary.goals)) {
    throw new DashboardResponseValidationError("summary.goals");
  }
  if (!Array.isArray(recentTransactions)) {
    throw new DashboardResponseValidationError("recent transactions.data");
  }
  if (!Array.isArray(accounts)) {
    throw new DashboardResponseValidationError("accounts");
  }

  requireMinorField(
    summary.balances,
    "totalMinor",
    "summary.balances.totalMinor",
  );
  requireMinorField(summary.income, "minor", "summary.income.minor");
  requireMinorField(summary.expenses, "minor", "summary.expenses.minor");
  requireMinorField(summary.savings, "minor", "summary.savings.minor");
  for (const budget of summary.budgets) {
    requireMinorField(budget, "limitMinor", "summary.budgets[].limitMinor");
    requireMinorField(budget, "spentMinor", "summary.budgets[].spentMinor");
    requireMinorField(
      budget,
      "remainingMinor",
      "summary.budgets[].remainingMinor",
    );
  }
  for (const goal of summary.goals) {
    requireMinorField(
      goal,
      "targetAmountMinor",
      "summary.goals[].targetAmountMinor",
    );
    requireMinorField(
      goal,
      "currentAmountMinor",
      "summary.goals[].currentAmountMinor",
    );
  }
  for (const transaction of recentTransactions) {
    requireMinorField(
      transaction,
      "amountMinor",
      "recent transactions.data[].amountMinor",
    );
  }
  for (const account of accounts) {
    requireMinorField(account, "balanceMinor", "accounts[].balanceMinor");
  }
}

async function loadDashboardRequest<T>(
  source: DashboardRequestSource,
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw new DashboardRequestFailure(source, error);
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DashboardLoadError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, txResult, accs] = await Promise.all([
        loadDashboardRequest("summary", () => api.dashboard.getSummary()),
        loadDashboardRequest("recent transactions", () =>
          api.transactions.list({ limit: 5 }),
        ),
        loadDashboardRequest("accounts", () => api.accounts.list()),
      ]);
      const transactionData = isRecord(txResult) ? txResult.data : undefined;
      validateDashboardFinancialData(s, transactionData, accs);
      setSummary(s);
      setRecentTx(txResult.data);
      setAccounts(
        [...accs].sort(
          (a, b) =>
            Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"),
        ),
      );
    } catch (loadError) {
      setError(getDashboardLoadError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    trackScreenOpened("dashboard");
  }, [load]);

  const currency = user?.baseCurrency ?? "USD";

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardHeader user={user} />
        <Skeleton className="h-48 rounded-3xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_.95fr]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div>
        <DashboardHeader user={user} />
        <ErrorState
          title={error?.code ? `Request failed (${error.code})` : undefined}
          message={
            error?.diagnostic
              ? `${error.message} ${error.diagnostic}`
              : error?.message ?? "Unable to load dashboard."
          }
          requestId={error?.requestId}
          onRetry={load}
        />
        {error?.unauthorized && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Go to login
            </Link>
          </p>
        )}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardHeader user={user} />
        <Card className="finora-hero rounded-3xl p-7 sm:p-10">
          <div className="relative z-10 max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-white/90 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" /> FINORA STARTER
            </div>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Build your financial home.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">
              Add your first account and Finora will turn your raw transactions
              into a clear, visual picture of your money.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={() => router.push("/accounts/new")}
                className="bg-white text-primary hover:bg-white/90"
              >
                <Plus className="me-2 h-4 w-4" />
                Add first account
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/settings")}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                Review settings
              </Button>
            </div>
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Wallet,
              title: "One clear balance",
              text: "Keep your accounts in one place.",
            },
            {
              icon: ReceiptText,
              title: "Simple tracking",
              text: "Capture income, spending and transfers.",
            },
            {
              icon: Target,
              title: "Goals that move",
              text: "Turn savings targets into visible progress.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <Card key={title} className="interactive-card rounded-2xl p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {text}
              </p>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const budgetTotal = summary.budgets.reduce(
    (s, b) => s + BigInt(b.limitMinor),
    0n,
  );
  const budgetSpent = summary.budgets.reduce(
    (s, b) => s + BigInt(b.spentMinor),
    0n,
  );
  const overallBudgetPercent = pct(budgetSpent, budgetTotal);
  const savings = BigInt(summary.savings.minor);

  return (
    <div className="space-y-7">
      <DashboardHeader user={user} />

      <section className="grid gap-4 lg:grid-cols-[1.55fr_.85fr]">
        <Card className="finora-hero rounded-3xl p-7 sm:p-8">
          <div className="relative z-10 flex h-full min-h-[220px] flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-white/75">
                  <CircleDollarSign className="h-4 w-4" />
                  Total balance
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/50">
                  {formatMonthYear(summary.period.year, summary.period.month)}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white/90 backdrop-blur-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                <Money
                  amountMinor={summary.balances.totalMinor}
                  currencyCode={currency}
                />
              </p>
              <p className="mt-3 max-w-lg text-sm leading-6 text-white/65">
                Your current balance across active accounts. Transfers move
                money between accounts without changing income or expense
                totals.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                onClick={() => router.push("/transactions/new")}
                className="bg-white text-primary hover:bg-white/90"
              >
                <Plus className="me-2 h-4 w-4" />
                Add transaction
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/accounts")}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Wallet className="me-2 h-4 w-4" />
                Accounts
              </Button>
            </div>
          </div>
        </Card>

        <Card className="surface-card rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Budget health</p>
              <p className="mt-1 text-xs text-muted-foreground">This month</p>
            </div>
            <PiggyBank className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-6 flex items-center gap-5">
            <div
              role="img"
              aria-label={`Budget usage ${Math.round(overallBudgetPercent)} percent`}
              className="relative h-28 w-28 shrink-0 rounded-full"
              style={{
                background: `conic-gradient(hsl(var(--primary)) ${overallBudgetPercent}%, hsl(var(--muted)) 0)`,
              }}
            >
              <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-card">
                <span className="font-display text-2xl font-semibold">
                  {Math.round(overallBudgetPercent)}%
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  used
                </span>
              </div>
            </div>
            <div className="min-w-0 space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Spent</p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {formatMoney(budgetSpent.toString(), currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Budgeted</p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {formatMoney(budgetTotal.toString(), currency)}
                </p>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-5 w-full justify-between"
            onClick={() => router.push("/budgets")}
          >
            Open budgets <ChevronRight className="h-4 w-4" />
          </Button>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={ArrowDownLeft}
          label="Income"
          amount={summary.income.minor}
          currency={currency}
          tone="success"
        />
        <MetricCard
          icon={ArrowUpRight}
          label="Expenses"
          amount={summary.expenses.minor}
          currency={currency}
          tone="danger"
        />
        <MetricCard
          icon={TrendingUp}
          label="Monthly savings"
          amount={summary.savings.minor}
          currency={currency}
          tone={savings >= 0n ? "primary" : "danger"}
        />
      </section>

      <CashFlowVisual
        incomeMinor={summary.income.minor}
        expensesMinor={summary.expenses.minor}
        savingsMinor={summary.savings.minor}
        currency={currency}
      />

      <section>
        <SectionHeading
          title="Your accounts"
          actionLabel="View all"
          onAction={() => router.push("/accounts")}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.slice(0, 6).map((account) => (
            <Link
              key={account.id}
              href={`/accounts/${account.id}`}
              className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Card className="interactive-card surface-card rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <AccountGlyph type={account.type} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{account.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatAccountType(account.type)}{" "}
                        · {account.currencyCode}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-6 font-display text-2xl font-semibold tabular-nums">
                  <Money
                    amountMinor={account.balanceMinor}
                    currencyCode={account.currencyCode}
                  />
                </p>
                <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {account.status === "ACTIVE"
                      ? "Active account"
                      : "Archived"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        account.status === "ACTIVE"
                          ? "bg-success"
                          : "bg-muted-foreground",
                      )}
                    />
                    {account.status === "ACTIVE" ? "Ready" : "Archived"}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="surface-card rounded-2xl p-6">
          <SectionHeading
            title="Budget overview"
            actionLabel={summary.budgets.length ? "Manage" : undefined}
            onAction={() => router.push("/budgets")}
          />
          {summary.budgets.length === 0 ? (
            <EmptyMini
              icon={PiggyBank}
              text="No budgets set for this month yet."
              action="Create a budget"
              onAction={() => router.push("/budgets")}
            />
          ) : (
            <div className="mt-5 space-y-5">
              {summary.budgets.slice(0, 5).map((b) => (
                <div key={b.categoryId}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {b.categoryName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatMoney(b.spentMinor, currency)} of{" "}
                        {formatMoney(b.limitMinor, currency)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold tabular-nums",
                        b.exceeded
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {Math.round(b.progressPercent)}%
                    </span>
                  </div>
                  <Progress
                    value={b.progressPercent}
                    className={cn(
                      "mt-2 h-2",
                      b.exceeded && "[&>[data-slot=indicator]]:bg-destructive",
                    )}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="surface-card rounded-2xl p-6">
          <SectionHeading
            title="Savings goals"
            actionLabel={summary.goals.length ? "Open" : undefined}
            onAction={() => router.push("/savings")}
          />
          {summary.goals.length === 0 ? (
            <EmptyMini
              icon={Target}
              text="Give your next goal a visible finish line."
              action="Create a goal"
              onAction={() => router.push("/savings")}
            />
          ) : (
            <div className="mt-5 space-y-5">
              {summary.goals.slice(0, 4).map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatMoney(g.currentAmountMinor, currency)} of{" "}
                        {formatMoney(g.targetAmountMinor, currency)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-primary">
                      {Math.round(g.progressPercent)}%
                    </span>
                  </div>
                  <Progress
                    value={g.progressPercent}
                    className="mt-2 h-2 [&>[data-slot=indicator]]:bg-primary"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Recent activity"
          actionLabel={recentTx.length ? "See all" : undefined}
          onAction={() => router.push("/transactions")}
        />
        {recentTx.length === 0 ? (
          <Card className="mt-4 rounded-2xl border-dashed p-8 text-center">
            <ReceiptText className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No transactions yet.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/transactions/new")}
            >
              <Plus className="me-2 h-4 w-4" />
              Add transaction
            </Button>
          </Card>
        ) : (
          <Card className="surface-card mt-4 overflow-hidden rounded-2xl">
            {recentTx.map((tx, i) => (
              <Link
                key={tx.id}
                href={`/transactions/${tx.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              >
                <TransactionTypeIcon type={tx.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {tx.description || tx.type.toLowerCase()}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(tx.transactionDate, "short")}
                    {tx.status === "VOIDED" ? " · Voided" : ""}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    tx.type === "INCOME" && "text-success",
                    tx.type === "EXPENSE" && "text-foreground",
                    tx.type === "TRANSFER" && "text-muted-foreground",
                    tx.status === "VOIDED" && "opacity-50",
                  )}
                >
                  {tx.type === "EXPENSE"
                    ? "-"
                    : tx.type === "INCOME"
                      ? "+"
                      : ""}
                  {formatMoney(tx.amountMinor, tx.currencyCode)}
                </p>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                {i < recentTx.length - 1 && <span className="sr-only">.</span>}
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function CashFlowVisual({
  incomeMinor,
  expensesMinor,
  savingsMinor,
  currency,
}: {
  incomeMinor: string;
  expensesMinor: string;
  savingsMinor: string;
  currency: string;
}) {
  const income = BigInt(incomeMinor);
  const expenses = BigInt(expensesMinor);
  const savings = BigInt(savingsMinor);
  const max = income > expenses ? income : expenses;
  const scale = (value: bigint) =>
    max <= 0n ? 0 : Math.min(100, Number((value * 100n) / max));

  return (
    <Card className="surface-card overflow-hidden rounded-2xl p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Monthly cash flow</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A visual comparison of income and spending for the current snapshot.
          </p>
        </div>
        <div
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
            savings >= 0n
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive",
          )}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          {savings >= 0n ? "Positive monthly savings" : "Spending above income"}
        </div>
      </div>

      <div
        className="mt-6 space-y-4"
        aria-label="Income and expenses comparison"
      >
        <p className="sr-only">
          Income is {formatMoney(incomeMinor, currency)}. Expenses are{" "}
          {formatMoney(expensesMinor, currency)}. Monthly savings are{" "}
          {formatMoney(savingsMinor, currency)}.
        </p>
        <FlowBar
          label="Income"
          amount={incomeMinor}
          currency={currency}
          width={scale(income)}
          tone="success"
        />
        <FlowBar
          label="Expenses"
          amount={expensesMinor}
          currency={currency}
          width={scale(expenses)}
          tone="neutral"
        />
      </div>
    </Card>
  );
}

function FlowBar({
  label,
  amount,
  currency,
  width,
  tone,
}: {
  label: string;
  amount: string;
  currency: string;
  width: number;
  tone: "success" | "neutral";
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <Money amountMinor={amount} currencyCode={currency} />
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${label}: ${Math.round(width)} percent relative scale`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            tone === "success" ? "bg-success" : "bg-foreground/40",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  amount,
  currency,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  amount: string;
  currency: string;
  tone: "success" | "danger" | "primary";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "danger"
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/10 text-primary";
  return (
    <Card className="interactive-card surface-card rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            toneClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="mt-4 font-display text-2xl font-semibold tabular-nums">
        <Money amountMinor={amount} currencyCode={currency} />
      </p>
    </Card>
  );
}

function AccountGlyph({ type }: { type: unknown }) {
  if (!isAccountType(type)) return <Wallet className="h-5 w-5" />;
  if (type === "SAVINGS") return <PiggyBank className="h-5 w-5" />;
  if (type === "BANK") return <CreditCard className="h-5 w-5" />;
  return <Wallet className="h-5 w-5" />;
}

function SectionHeading({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {actionLabel && (
        <Button variant="ghost" size="sm" onClick={onAction}>
          {actionLabel}
          <ArrowRight className="ms-1.5 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function EmptyMini({
  icon: Icon,
  text,
  action,
  onAction,
}: {
  icon: LucideIcon;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-border/80 p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
      <button
        onClick={onAction}
        className="mt-2 text-sm font-semibold text-primary hover:underline"
      >
        {action}
      </button>
    </div>
  );
}

function DashboardHeader({ user }: { user: { email: string } | null }) {
  const router = useRouter();
  return (
    <div className="mb-1 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          {getGreeting()}
        </p>
        <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Your money, clearly.
          </h1>
          <span className="rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            Monthly snapshot
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A calm snapshot of where your money stands today.
        </p>
      </div>
      <button
        onClick={() => router.push("/settings")}
        className="shrink-0 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label="Open profile settings"
      >
        <Avatar className="h-11 w-11 border-2 border-background shadow-md ring-1 ring-border">
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {user ? getInitials(user.email) : "U"}
          </AvatarFallback>
        </Avatar>
      </button>
    </div>
  );
}
