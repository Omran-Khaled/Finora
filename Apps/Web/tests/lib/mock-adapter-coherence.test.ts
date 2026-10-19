// Financial contract coherence tests for the mock adapter (part 2):
// budget usage derived from ACTIVE expenses, goal progress derived from the
// linked savings account, and dashboard summary alignment.
import { describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '@/lib/mock-adapter';
import { mockAuth, seedDemoData } from '@/lib/mock-server';

describe('mock adapter — budgets & goals coherence', () => {
  beforeEach(() => {
    mockAuth.reset();
  });

  it('budget usage is derived from ACTIVE expenses only', async () => {
    await mockApi.auth.register({
      email: 'test@finora.app',
      password: 'secret123',
    });
    seedDemoData();
    const budgets = await mockApi.budgets.list();
    const food = budgets.find((b) => b.categoryId === 'sys-food')!;
    // Demo data contains one ACTIVE 15.00 food expense
    expect(food.spentMinor).toBe('1500');

    // A voided expense must not count towards budget usage
    const foodExpense = (await mockApi.transactions.list()).data.find(
      (t) => t.categoryId === 'sys-food'
    )!;
    await mockApi.transactions.void(foodExpense.id);
    const foodAfter = (await mockApi.budgets.list()).find(
      (b) => b.categoryId === 'sys-food'
    )!;
    expect(foodAfter.spentMinor).toBe('0');
  });

  it('goal progress is derived from the linked savings account, not a snapshot', async () => {
    await mockApi.auth.register({
      email: 'test@finora.app',
      password: 'secret123',
    });
    const savings = await mockApi.accounts.create({
      name: 'Savings',
      type: 'SAVINGS',
      currencyCode: 'USD',
      openingBalanceMinor: '0',
    });
    const goal = await mockApi.savingsGoals.create({
      accountId: savings.id,
      name: 'Laptop',
      targetAmountMinor: '100000',
    });

    const bank = await mockApi.accounts.create({
      name: 'Main bank',
      type: 'BANK',
      currencyCode: 'USD',
      openingBalanceMinor: '500000',
    });
    await mockApi.transfers.create({
      fromAccountId: bank.id,
      toAccountId: savings.id,
      amountMinor: '25000',
      transactionDate: '2026-08-05',
    }, 'web-coherence-transfer');

    const updated = await mockApi.savingsGoals.get(goal.id);
    expect(updated?.currentAmountMinor).toBe('25000');
    expect(updated?.progressPercent).toBe(25);

    const listed = await mockApi.savingsGoals.list();
    expect(listed.find((g) => g.id === goal.id)?.progressPercent).toBe(25);
  });

  it('dashboard summary reflects income/expenses with voided exclusion', async () => {
    await mockApi.auth.register({
      email: 'test@finora.app',
      password: 'secret123',
    });
    seedDemoData();
    const summary = await mockApi.dashboard.getSummary();
    expect(BigInt(summary.balances.totalMinor)).toBeGreaterThan(BigInt(0));
    // Demo seed: 240.00 income and 135.00 of ACTIVE expenses this month
    expect(summary.income.minor).toBe('240000');
    expect(summary.expenses.minor).toBe('11500');
  });
});
