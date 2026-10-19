// Mock ↔ real PATCH contract parity for rename-only endpoints.
// The real API validates both routes with forbidNonWhitelisted against
// rename-only DTOs (UpdateCategoryDto / UpdateGoalDto), so the mock adapter
// must expose the same supported request contract: `{ name }` only, with
// create-only fields (type, targetAmountMinor, targetDate) never mutable.
import { describe, it, expect, beforeEach } from 'vitest';
import { mockApi } from '@/lib/mock-adapter';
import { mockAuth } from '@/lib/mock-server';

describe('mock adapter — rename-only PATCH contract', () => {
  beforeEach(() => {
    mockAuth.reset();
  });

  it('renames a category with a name-only payload and preserves its type', async () => {
    await mockApi.auth.register({ email: 'patch@finora.app', password: 'secret123' });
    const category = await mockApi.categories.create({ name: 'Groceries', type: 'EXPENSE' });

    const updated = await mockApi.categories.update(category.id, {
      name: 'Weekly Groceries',
    });

    expect(updated.name).toBe('Weekly Groceries');
    expect(updated.type).toBe('EXPENSE');
    expect(updated.status).toBe('ACTIVE');
  });

  it('renames a savings goal without touching its target amount or date', async () => {
    await mockApi.auth.register({ email: 'patch-goal@finora.app', password: 'secret123' });
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
      targetDate: '2027-06-01',
    });

    const updated = await mockApi.savingsGoals.update(goal.id, { name: 'Laptop Pro' });

    expect(updated.name).toBe('Laptop Pro');
    expect(updated.targetAmountMinor).toBe('100000');
    expect(updated.targetDate).toBe('2027-06-01');
  });
});