import { InMemoryStore, TransactionRecord } from '../src/core/store';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { PrismaAccountRepository } from '../src/database/repositories/prisma-account.repository';
import { PrismaBudgetRepository } from '../src/database/repositories/budget.repository';
import { PrismaCategoryRepository } from '../src/database/repositories/category.repository';
import { PrismaGoalRepository } from '../src/database/repositories/goal.repository';
import { PrismaTransactionRepository } from '../src/database/repositories/transaction.repository';

// One fixture, two persistence modes. A-001 requires the dashboard to return the
// same shape AND the same values whether budgets/goals are read from the
// in-memory store or from persistent repositories.
const USER = 'user-1';
const BANK = 'bank';
const SAVINGS = 'savings';
const ARCHIVED = 'archived';
const FOOD = 'cat-food';

const transactions: TransactionRecord[] = [
  { id: 't-expense', userId: USER, accountId: BANK, categoryId: FOOD, type: 'EXPENSE', amountMinor: 100n, currencyCode: 'USD', description: null, transactionDate: '2026-08-10', status: 'ACTIVE', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
  { id: 't-income', userId: USER, accountId: BANK, categoryId: null, type: 'INCOME', amountMinor: 1000n, currencyCode: 'USD', description: null, transactionDate: '2026-08-11', status: 'ACTIVE', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' },
  { id: 't-transfer-source', userId: USER, accountId: BANK, categoryId: null, type: 'TRANSFER', amountMinor: 200n, currencyCode: 'USD', description: null, transactionDate: '2026-08-12', status: 'ACTIVE', transferDirection: 'SOURCE', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' },
  { id: 't-transfer-destination', userId: USER, accountId: SAVINGS, categoryId: null, type: 'TRANSFER', amountMinor: 200n, currencyCode: 'USD', description: null, transactionDate: '2026-08-12', status: 'ACTIVE', transferDirection: 'DESTINATION', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' },
  { id: 't-voided', userId: USER, accountId: BANK, categoryId: FOOD, type: 'EXPENSE', amountMinor: 999n, currencyCode: 'USD', description: null, transactionDate: '2026-08-13', status: 'VOIDED', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  { id: 't-other-month', userId: USER, accountId: BANK, categoryId: FOOD, type: 'EXPENSE', amountMinor: 50n, currencyCode: 'USD', description: null, transactionDate: '2026-07-05', status: 'ACTIVE', createdAt: '2026-07-05T00:00:00.000Z', updatedAt: '2026-07-05T00:00:00.000Z' },
];

function accountBalance(accountId: string): bigint {
  const opening = accountId === BANK ? 500n : 100n;
  return transactions
    .filter((item) => item.accountId === accountId && item.status === 'ACTIVE')
    .reduce((balance, item) => (item.type === 'INCOME' || item.transferDirection === 'DESTINATION' ? balance + item.amountMinor : balance - item.amountMinor), opening);
}

function memoryStore(): InMemoryStore {
  const store = new InMemoryStore();
  store.accounts.set(BANK, { id: BANK, userId: USER, name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: 500n, status: 'ACTIVE' });
  store.accounts.set(SAVINGS, { id: SAVINGS, userId: USER, name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: 100n, status: 'ACTIVE' });
  store.accounts.set(ARCHIVED, { id: ARCHIVED, userId: USER, name: 'Old Account', type: 'CASH', currencyCode: 'USD', openingBalanceMinor: 9000n, status: 'ARCHIVED' });
  for (const transaction of transactions) store.transactions.set(transaction.id, transaction);
  store.categories.set(FOOD, { id: FOOD, userId: USER, name: 'Food', type: 'EXPENSE', isSystem: false, status: 'ACTIVE' });
  store.budgets.set('budget-1', { id: 'budget-1', userId: USER, categoryId: FOOD, year: 2026, month: 8, limitMinor: 30000n });
  store.goals.set('goal-1', { id: 'goal-1', userId: USER, accountId: SAVINGS, name: 'Laptop', targetAmountMinor: 300n, targetDate: '2027-06-01', status: 'ACTIVE' });
  return store;
}

function persistentRepositories() {
  const accounts = {
    listForUser: async () => ({
      data: [
        { id: BANK, userId: USER, name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: 500n, status: 'ACTIVE' },
        { id: SAVINGS, userId: USER, name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: 100n, status: 'ACTIVE' },
        { id: ARCHIVED, userId: USER, name: 'Old Account', type: 'CASH', currencyCode: 'USD', openingBalanceMinor: 9000n, status: 'ARCHIVED' },
      ],
      nextCursor: null,
    }),
    balancesForUser: async () => new Map([[BANK, accountBalance(BANK)], [SAVINGS, accountBalance(SAVINGS)]]),
  } as unknown as PrismaAccountRepository;

  // P-001: the real repositories answer with the `{ data, nextCursor }` page
  // envelope, so the stubs must mirror that contract.
  const persistentTransactions = {
    monthlyTotals: async () => ({ income: 1000n, expenses: 100n }),
    expenseTotalsByCategory: async () => new Map([[FOOD, 100n]]),
    list: async (_userId: string, filters: { accountId?: string; categoryId?: string; type?: string; from?: string; to?: string }) => ({
      data: transactions.filter((item) =>
        (!filters.accountId || item.accountId === filters.accountId) &&
        (!filters.categoryId || item.categoryId === filters.categoryId) &&
        (!filters.type || item.type === filters.type) &&
        (!filters.from || item.transactionDate >= filters.from) &&
        (!filters.to || item.transactionDate <= filters.to)),
      nextCursor: null,
    }),
  } as unknown as PrismaTransactionRepository;

  const budgets = {
    list: async () => ({ data: [{ id: 'budget-1', userId: USER, categoryId: FOOD, year: 2026, month: 8, limitMinor: 30000n }], nextCursor: null }),
  } as unknown as PrismaBudgetRepository;

  const goals = {
    list: async () => ({ data: [{ id: 'goal-1', userId: USER, accountId: SAVINGS, name: 'Laptop', targetAmountMinor: 300n, targetDate: '2027-06-01', status: 'ACTIVE' }], nextCursor: null }),
  } as unknown as PrismaGoalRepository;

  const categories = {
    list: async () => ({ data: [{ id: FOOD, userId: USER, name: 'Food', isSystem: false, status: 'ACTIVE' }], nextCursor: null }),
  } as unknown as PrismaCategoryRepository;

  return { accounts, persistentTransactions, budgets, goals, categories };
}
describe('dashboard parity (A-001)', () => {
  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  it('returns identical summary values in memory mode and Prisma mode', async () => {
    const memorySummary = await new DashboardService(memoryStore()).summary(USER, 2026, 8);

    process.env.ENABLE_PRISMA = 'true';
    const { accounts, persistentTransactions, budgets, goals, categories } = persistentRepositories();
    const prismaSummary = await new DashboardService(
      new InMemoryStore(),
      accounts,
      persistentTransactions,
      budgets,
      goals,
      categories,
    ).summary(USER, 2026, 8);

    expect(prismaSummary).toEqual(memorySummary);
  });

  it('prisma mode reports non-empty budgets and goals with computed values', async () => {
    process.env.ENABLE_PRISMA = 'true';
    const { accounts, persistentTransactions, budgets, goals, categories } = persistentRepositories();
    const summary = await new DashboardService(new InMemoryStore(), accounts, persistentTransactions, budgets, goals, categories).summary(USER, 2026, 8);

    expect(summary.income.minor).toBe('1000');
    expect(summary.expenses.minor).toBe('100');
    expect(summary.savings.minor).toBe('900');
    // Active-account balances are not month-scoped: bank 500 - 100 + 1000 - 200 - 50 = 1150, savings 100 + 200 = 300; the archived account is excluded.
    expect(summary.balances.totalMinor).toBe('1450');
    expect(summary.budgets).toHaveLength(1);
    expect(summary.budgets[0]).toMatchObject({ categoryId: FOOD, categoryName: 'Food', limitMinor: '30000', spentMinor: '100', remainingMinor: '29900', exceeded: false });
    expect(summary.goals).toHaveLength(1);
    expect(summary.goals[0]).toMatchObject({ id: 'goal-1', name: 'Laptop', accountName: 'Savings', currentAmountMinor: '300', progressPercent: 100, targetDate: '2027-06-01', status: 'COMPLETED' });
  });
});