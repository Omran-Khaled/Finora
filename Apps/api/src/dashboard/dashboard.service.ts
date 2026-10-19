import { Injectable } from "@nestjs/common";
import { InMemoryStore } from "../core/store";
import { monthPrefix, monthWindow } from "../core/period";
import { fromMinor, minorPercentage } from "../core/money";
import { PrismaAccountRepository } from "../database/repositories/prisma-account.repository";
import { PrismaBudgetRepository } from "../database/repositories/budget.repository";
import { PrismaCategoryRepository } from "../database/repositories/category.repository";
import { PrismaGoalRepository } from "../database/repositories/goal.repository";
import { PrismaTransactionRepository } from "../database/repositories/transaction.repository";
import { isPrismaPersistenceEnabled } from "../config/persistence";

@Injectable()
export class DashboardService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly accounts?: PrismaAccountRepository,
    private readonly transactions?: PrismaTransactionRepository,
    private readonly budgets?: PrismaBudgetRepository,
    private readonly goals?: PrismaGoalRepository,
    private readonly categories?: PrismaCategoryRepository,
  ) {}
  async summary(userId: string, year: number, month: number) {
    const { prefix, from, to } = monthWindow(year, month);
    if (
      isPrismaPersistenceEnabled() &&
      this.accounts &&
      this.transactions &&
      this.budgets &&
      this.goals
    ) {
      const [
        accountPage,
        monthlyTotals,
        budgetPage,
        goalPage,
        categoryPage,
        balancesByAccount,
        expenseTotalsByCategory,
      ] = await Promise.all([
        this.accounts.listForUser(userId),
        this.transactions.monthlyTotals(userId, from, to),
        this.budgets.list(userId),
        this.goals.list(userId),
        this.categories
          ? this.categories.list(userId)
          : Promise.resolve({ data: [], nextCursor: null }),
        this.accounts.balancesForUser(userId),
        this.transactions.expenseTotalsByCategory(userId, from, to),
      ]);
      const accounts = accountPage.data;
      const activeAccounts = accounts.filter((account) => account.status === "ACTIVE");
      const budgetRows = budgetPage.data;
      const goalRows = goalPage.data.filter((goal) => goal.status === "ACTIVE");
      const categoryRows = categoryPage.data;
      const income = monthlyTotals.income;
      const expenses = monthlyTotals.expenses;
      const totalMinor = activeAccounts.reduce(
        (sum, account) => sum + (balancesByAccount.get(account.id) ?? 0n),
        0n,
      );
      // Budgets/goals are computed from persistent rows, mirroring BudgetsService.view and GoalsService.view.
      const budgets = await Promise.all(
        budgetRows
          .filter((budget) => budget.year === year && budget.month === month)
          .map(async (budget) => {
            const spent = expenseTotalsByCategory.get(budget.categoryId) ?? 0n;
            // Mirrors the in-memory branch below so both modes agree for exceeded budgets.
            const progressPercent = minorPercentage(spent, budget.limitMinor, 100n);
            const exceeded = spent > budget.limitMinor;
            const percentage = progressPercent;
            const isExceeded = exceeded;
            const categoryName =
              categoryRows.find((category) => category.id === budget.categoryId)
                ?.name ?? "Category";
            return {
              categoryId: budget.categoryId,
              categoryName,
              limitMinor: fromMinor(budget.limitMinor),
              spentMinor: fromMinor(spent),
              remainingMinor: fromMinor(budget.limitMinor - spent),
              progressPercent,
              exceeded,
              percentage,
              isExceeded: exceeded,
              usagePercentage: percentage,
            };
          }),
      );
      const goals = await Promise.all(
        goalRows
          .filter((goal) => goal.userId === userId)
          .map(async (goal) => {
            const balance = balancesByAccount.get(goal.accountId) ?? 0n;
            const progressPercent = minorPercentage(balance, goal.targetAmountMinor, 100n);
            const accountName =
              activeAccounts.find((account) => account.id === goal.accountId)?.name ??
              "Savings Goal";
            return {
              id: goal.id,
              name: goal.name,
              accountId: goal.accountId,
              accountName,
              targetAmountMinor: fromMinor(goal.targetAmountMinor),
              currentAmountMinor: fromMinor(balance),
              currentBalanceMinor: fromMinor(balance),
              progressPercent,
              progressPercentage: progressPercent,
              targetDate: goal.targetDate,
              status: goal.status === "ACTIVE" && progressPercent >= 100 ? "COMPLETED" : goal.status,
            };
          }),
      );
      return {
        period: { year, month },
        balances: { totalMinor: fromMinor(totalMinor) },
        income: { minor: fromMinor(income) },
        expenses: { minor: fromMinor(expenses) },
        savings: { minor: fromMinor(income - expenses) },
        budgets,
        goals,
      };
    }

    const transactions = [...this.store.transactions.values()].filter(
      (item) =>
        item.userId === userId &&
        item.status === "ACTIVE" &&
        item.transactionDate.startsWith(prefix),
    );
    const income = transactions
      .filter((item) => item.type === "INCOME")
      .reduce((sum, item) => sum + item.amountMinor, 0n);
    const expenses = transactions
      .filter((item) => item.type === "EXPENSE")
      .reduce((sum, item) => sum + item.amountMinor, 0n);
    const userAccounts = [...this.store.accounts.values()].filter(
      (item) => item.userId === userId && item.status === "ACTIVE",
    );
    const budgets = [...this.store.budgets.values()]
      .filter(
        (item) =>
          item.userId === userId && item.year === year && item.month === month,
      )
      .map((budget) => {
        const spent = [...this.store.transactions.values()]
          .filter(
            (item) =>
              item.userId === userId &&
              item.categoryId === budget.categoryId &&
              item.type === "EXPENSE" &&
              item.status === "ACTIVE" &&
              item.transactionDate.startsWith(
                monthPrefix(budget.year, budget.month),
              ),
          )
          .reduce((sum, item) => sum + item.amountMinor, 0n);
        const progressPercent = minorPercentage(spent, budget.limitMinor, 100n);
        const exceeded = spent > budget.limitMinor;
        const percentage = progressPercent;
        const isExceeded = exceeded;
        const categoryName =
          [...this.store.categories.values()].find(
            (category) => category.id === budget.categoryId,
          )?.name ?? "Category";
        return {
          categoryId: budget.categoryId,
          categoryName,
          limitMinor: fromMinor(budget.limitMinor),
          spentMinor: fromMinor(spent),
          remainingMinor: fromMinor(budget.limitMinor - spent),
          progressPercent,
          exceeded,
          percentage,
          isExceeded,
          usagePercentage: progressPercent,
        };
      });
    const goals = [...this.store.goals.values()]
      .filter((item) => item.userId === userId && item.status === "ACTIVE")
      .map((goal) => {
        const balance = this.store.accountBalance(goal.accountId);
        const progressPercent = minorPercentage(balance, goal.targetAmountMinor, 100n);
        const accountName =
          userAccounts.find((account) => account.id === goal.accountId)?.name ??
          "Savings Goal";
        return {
          id: goal.id,
          name: goal.name,
          accountId: goal.accountId,
          accountName,
          targetAmountMinor: fromMinor(goal.targetAmountMinor),
          currentAmountMinor: fromMinor(balance),
          currentBalanceMinor: fromMinor(balance),
          progressPercent,
          progressPercentage: progressPercent,
          targetDate: goal.targetDate,
          // A-001 parity: mirror the Prisma branch above (and GoalsService.view) — a goal that
          // reached its target reports COMPLETED. Read-only: the store row is never mutated here.
          status: goal.status === "ACTIVE" && progressPercent >= 100 ? "COMPLETED" : goal.status,
        };
      });

    return {
      period: { year, month },
      balances: {
        totalMinor: fromMinor(
          userAccounts.reduce(
            (sum, item) => sum + this.store.accountBalance(item.id),
            0n,
          ),
        ),
      },
      income: { minor: fromMinor(income) },
      expenses: { minor: fromMinor(expenses) },
      savings: { minor: fromMinor(income - expenses) },
      budgets,
      goals,
    };
  }
}
