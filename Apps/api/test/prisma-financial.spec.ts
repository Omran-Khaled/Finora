import { randomUUID } from 'node:crypto';
import { HttpException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InMemoryStore } from '../src/core/store';
import { AccountsService } from '../src/accounts/accounts.service';
import { BudgetsService } from '../src/budgets/budgets.service';
import { GoalsService } from '../src/goals/goals.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransfersService } from '../src/transfers/transfers.service';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaAccountRepository } from '../src/database/repositories/prisma-account.repository';
import { PrismaBudgetRepository } from '../src/database/repositories/budget.repository';
import { PrismaCategoryRepository } from '../src/database/repositories/category.repository';
import { PrismaGoalRepository } from '../src/database/repositories/goal.repository';
import { PrismaTransactionRepository } from '../src/database/repositories/transaction.repository';
import { PrismaTransferRepository } from '../src/database/repositories/transfer.repository';

/**
 * T-001 — financial invariants against a real PostgreSQL instance.
 *
 * The suite is skipped unless `DATABASE_URL` is set, so the default `pnpm test`
 * stays green on a machine without a database. CI must provision Postgres and
 * run `prisma migrate deploy` first (see `.github/workflows/ci.yml`).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

/** Canonical error codes of the rejected outcomes, so a race failure is legible. */
function rejectedReasons(results: PromiseSettledResult<unknown>[]): string[] {
  return results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) =>
      result.reason instanceof HttpException
        ? String((result.reason.getResponse() as { code?: string }).code)
        : String(result.reason),
    );
}

function fulfilledCount(results: readonly PromiseSettledResult<unknown>[]): number {
  return results.filter((result) => result.status === 'fulfilled').length;
}

function fulfilled<T>(results: PromiseSettledResult<T>[]): T[] {
  return results
    .filter((result): result is PromiseFulfilledResult<T> => result.status === 'fulfilled')
    .map((result) => result.value);
}

suite('T-001 — Prisma financial invariants (real database)', () => {
  const createdUserIds: string[] = [];
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.ENABLE_PRISMA = 'true';
    prisma = new PrismaService();
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      // No cascading deletes in the schema: remove children before the user row.
      await prisma.db.transfer.deleteMany({ where: { userId } });
      await prisma.db.transaction.deleteMany({ where: { userId } });
      await prisma.db.budget.deleteMany({ where: { userId } });
      await prisma.db.savingsGoal.deleteMany({ where: { userId } });
      await prisma.db.account.deleteMany({ where: { userId } });
      await prisma.db.session.deleteMany({ where: { userId } });
      await prisma.db.category.deleteMany({ where: { userId } });
      await prisma.db.user.deleteMany({ where: { id: userId } });
    }
    await prisma.onModuleDestroy();
    delete process.env.ENABLE_PRISMA;
  });

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await prisma.db.user.create({ data: { id, email: `t001-${id}@finora.test`, passwordHash: 'scrypt$fixture$not-a-real-hash', baseCurrency: 'USD' } });
    createdUserIds.push(id);
    return id;
  }

  function buildServices() {
    const store = new InMemoryStore();
    const accountRepo = new PrismaAccountRepository(prisma);
    const categoryRepo = new PrismaCategoryRepository(prisma);
    const transactionRepo = new PrismaTransactionRepository(prisma);
    const transferRepo = new PrismaTransferRepository(prisma);
    return {
      store,
      accounts: new AccountsService(store, accountRepo),
      transactions: new TransactionsService(store, accountRepo, transactionRepo, categoryRepo),
      transfers: new TransfersService(store, accountRepo, transferRepo, transactionRepo),
      budgets: new BudgetsService(store, new PrismaBudgetRepository(prisma), transactionRepo, categoryRepo),
      goals: new GoalsService(store, new PrismaGoalRepository(prisma), accountRepo),
    };
  }

  it('conserves money across a transfer and honours direction', async () => {
    const userId = await createUser();
    const { accounts, transfers } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '500' });
    const savings = await accounts.create(userId, { name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '100' });

    await transfers.create(userId, { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '200', transactionDate: '2026-08-30' });

    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('300');
    expect((await accounts.get(userId, savings.id)).balanceMinor).toBe('300');
  });

  it('excludes voided legs from balances', async () => {
    const userId = await createUser();
    const { accounts, transfers } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '500' });
    const savings = await accounts.create(userId, { name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '100' });

    const transfer = await transfers.create(userId, { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '200', transactionDate: '2026-08-30' });
    await transfers.void(userId, transfer.transfer.id);

    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('500');
    expect((await accounts.get(userId, savings.id)).balanceMinor).toBe('100');
  });

  it('aggregates budget spending by user, category, active status, and inclusive month boundaries', async () => {
    const userId = await createUser();
    const { accounts, budgets } = buildServices();
    const account = await accounts.create(userId, {
      name: 'Spending',
      type: 'BANK',
      currencyCode: 'USD',
      openingBalanceMinor: '0',
    });
    const categoryId = randomUUID();
    const otherCategoryId = randomUUID();
    const emptyCategoryId = randomUUID();
    for (const [id, name] of [
      [categoryId, 'Food'],
      [otherCategoryId, 'Travel'],
      [emptyCategoryId, 'Other'],
    ]) {
      await prisma.db.category.create({
        data: { id, userId, name, type: 'EXPENSE', isSystem: false, status: 'ACTIVE' },
      });
    }
    const transactionRows = [
      { categoryId, date: '2026-02-01', amountMinor: 100n, status: 'ACTIVE' as const },
      { categoryId, date: '2026-02-28', amountMinor: 200n, status: 'ACTIVE' as const },
      { categoryId, date: '2026-03-01', amountMinor: 900n, status: 'ACTIVE' as const },
      { categoryId, date: '2026-02-15', amountMinor: 500n, status: 'VOIDED' as const },
      { categoryId: otherCategoryId, date: '2026-02-28', amountMinor: 700n, status: 'ACTIVE' as const },
      { categoryId, date: '2026-04-30', amountMinor: 400n, status: 'ACTIVE' as const },
      { categoryId, date: '2026-05-01', amountMinor: 800n, status: 'ACTIVE' as const },
    ];
    await prisma.db.transaction.createMany({
      data: transactionRows.map((row) => ({
        id: randomUUID(),
        userId,
        accountId: account.id,
        categoryId: row.categoryId,
        type: 'EXPENSE',
        amountMinor: row.amountMinor,
        currencyCode: 'USD',
        transactionDate: new Date(`${row.date}T00:00:00.000Z`),
        status: row.status,
      })),
    });
    await expect(
      prisma.db.transaction.create({
        data: {
          id: randomUUID(),
          userId,
          accountId: account.id,
          categoryId,
          type: 'EXPENSE',
          amountMinor: -1n,
          currencyCode: 'USD',
          transactionDate: new Date('2026-02-10T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      }),
    ).rejects.toThrow();

    const february = await budgets.create(userId, {
      categoryId,
      year: 2026,
      month: 2,
      limitMinor: '1000',
    });
    const april = await budgets.create(userId, {
      categoryId,
      year: 2026,
      month: 4,
      limitMinor: '1000',
    });
    const empty = await budgets.create(userId, {
      categoryId: emptyCategoryId,
      year: 2026,
      month: 2,
      limitMinor: '1000',
    });

    expect(february.spentMinor).toBe('300');
    expect(april.spentMinor).toBe('400');
    expect(empty.spentMinor).toBe('0');
  });

  it('replays an idempotent transfer instead of writing a second pair of legs', async () => {
    const userId = await createUser();
    const { accounts, transfers } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '500' });
    const savings = await accounts.create(userId, { name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '100' });

    const input = { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '200', transactionDate: '2026-08-30' };
    const first = await transfers.create(userId, input, 'replay-key');
    const second = await transfers.create(userId, input, 'replay-key');

    expect(second.transfer.id).toBe(first.transfer.id);
    expect(await prisma.db.transaction.count({ where: { userId, type: 'TRANSFER' } })).toBe(2);
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('300');
  });

  it('rejects an overdrawing expense and a same-account transfer without writing', async () => {
    const userId = await createUser();
    const { accounts, transactions, transfers } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '1000' });

    await expect(transactions.create(userId, { type: 'EXPENSE', accountId: bank.id, amountMinor: '5000', transactionDate: '2026-08-10' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(transfers.create(userId, { fromAccountId: bank.id, toAccountId: bank.id, amountMinor: '100', transactionDate: '2026-08-10' })).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(await prisma.db.transaction.count({ where: { userId } })).toBe(0);
    expect(await prisma.db.transfer.count({ where: { userId } })).toBe(0);
  });

  it('serializes concurrent expenses against the account row', async () => {
    const userId = await createUser();
    const { accounts, transactions } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' });
    const categoryId = randomUUID();
    await prisma.db.category.create({ data: { id: categoryId, userId, name: 'Food', type: 'EXPENSE', isSystem: false, status: 'ACTIVE' } });

    const results = await Promise.allSettled([
      transactions.create(userId, { type: 'EXPENSE', accountId: bank.id, categoryId, amountMinor: '80', transactionDate: '2026-08-10' }),
      transactions.create(userId, { type: 'EXPENSE', accountId: bank.id, categoryId, amountMinor: '80', transactionDate: '2026-08-10' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.db.transaction.count({ where: { userId, type: 'EXPENSE' } })).toBe(1);
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('20');
  });

  it('serializes concurrent outgoing transfers and rolls back the losing legs', async () => {
    const userId = await createUser();
    const { accounts, transfers } = buildServices();
    const source = await accounts.create(userId, { name: 'Source', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' });
    const firstDestination = await accounts.create(userId, { name: 'First destination', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' });
    const secondDestination = await accounts.create(userId, { name: 'Second destination', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' });

    const results = await Promise.allSettled([
      transfers.create(userId, { fromAccountId: source.id, toAccountId: firstDestination.id, amountMinor: '80', transactionDate: '2026-08-10' }),
      transfers.create(userId, { fromAccountId: source.id, toAccountId: secondDestination.id, amountMinor: '80', transactionDate: '2026-08-10' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.db.transfer.count({ where: { userId } })).toBe(1);
    expect(await prisma.db.transaction.count({ where: { userId, type: 'TRANSFER' } })).toBe(2);
    expect((await accounts.get(userId, source.id)).balanceMinor).toBe('20');
  });

  it('serializes an income void against an expense on the same account', async () => {
    const userId = await createUser();
    const { accounts, transactions } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '0' });
    const categoryId = randomUUID();
    await prisma.db.category.create({ data: { id: categoryId, userId, name: 'Food', type: 'EXPENSE', isSystem: false, status: 'ACTIVE' } });
    const income = await transactions.create(userId, {
      type: 'INCOME',
      accountId: bank.id,
      amountMinor: '100',
      transactionDate: '2026-08-10',
    });

    const results = await Promise.allSettled([
      transactions.void(userId, income.id),
      transactions.create(userId, {
        type: 'EXPENSE',
        accountId: bank.id,
        categoryId,
        amountMinor: '100',
        transactionDate: '2026-08-10',
      }),
    ]);

    expect(fulfilledCount(results)).toBe(1);
    expect(rejectedReasons(results)).toEqual(['INSUFFICIENT_FUNDS']);
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('0');
    expect(await prisma.db.transaction.count({ where: { userId, type: 'EXPENSE' } })).toBe(
      (await transactions.get(userId, income.id)).status === 'VOIDED' ? 0 : 1,
    );
  });

  it('serializes transfer void against an expense at the destination and keeps both legs atomic', async () => {
    const userId = await createUser();
    const { accounts, transactions, transfers } = buildServices();
    const source = await accounts.create(userId, { name: 'Source', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' });
    const destination = await accounts.create(userId, { name: 'Destination', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' });
    const categoryId = randomUUID();
    await prisma.db.category.create({ data: { id: categoryId, userId, name: 'Food', type: 'EXPENSE', isSystem: false, status: 'ACTIVE' } });
    const transfer = await transfers.create(userId, {
      fromAccountId: source.id,
      toAccountId: destination.id,
      amountMinor: '100',
      transactionDate: '2026-08-10',
    });

    const results = await Promise.allSettled([
      transfers.void(userId, transfer.transfer.id),
      transactions.create(userId, {
        type: 'EXPENSE',
        accountId: destination.id,
        categoryId,
        amountMinor: '100',
        transactionDate: '2026-08-10',
      }),
    ]);

    expect(fulfilledCount(results)).toBe(1);
    expect(rejectedReasons(results)).toEqual(['INSUFFICIENT_FUNDS']);
    const sourceLeg = await transactions.get(userId, transfer.sourceTx.id);
    const destinationLeg = await transactions.get(userId, transfer.destinationTx.id);
    expect(sourceLeg.status).toBe(destinationLeg.status);
    expect((await accounts.get(userId, source.id)).balanceMinor).toBe(
      sourceLeg.status === 'VOIDED' ? '100' : '0',
    );
    expect((await accounts.get(userId, destination.id)).balanceMinor).toBe('0');
    expect(await prisma.db.transaction.count({ where: { userId, type: 'EXPENSE' } })).toBe(
      sourceLeg.status === 'VOIDED' ? 0 : 1,
    );
  });

  it('replays a concurrent identical expense instead of failing the replay with INSUFFICIENT_FUNDS', async () => {
    const userId = await createUser();
    const { accounts, transactions } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' });
    const categoryId = randomUUID();
    await prisma.db.category.create({ data: { id: categoryId, userId, name: 'Food', type: 'EXPENSE', isSystem: false, status: 'ACTIVE' } });
    const key = `concurrent-expense-replay-${randomUUID()}`;
    const input = { type: 'EXPENSE' as const, accountId: bank.id, categoryId, amountMinor: '100', transactionDate: '2026-08-10' };

    // Two identical requests in flight with the same idempotency key and exactly
    // enough funds: the replay must resolve to the original resource, never to the
    // balance that the first request already consumed.
    const settled = await Promise.allSettled([
      transactions.create(userId, input, key),
      transactions.create(userId, input, key),
    ]);

    expect(rejectedReasons(settled)).toEqual([]);
    const created = fulfilled(settled);
    expect(created).toHaveLength(2);
    expect(created[0].id).toBe(created[1].id);
    expect(await prisma.db.transaction.count({ where: { userId, type: 'EXPENSE' } })).toBe(1);
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('0');
  });

  it('rejects a concurrent reuse of one idempotency key with a different expense payload', async () => {
    const userId = await createUser();
    const { accounts, transactions } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' });
    const categoryId = randomUUID();
    await prisma.db.category.create({ data: { id: categoryId, userId, name: 'Food', type: 'EXPENSE', isSystem: false, status: 'ACTIVE' } });
    const key = `concurrent-expense-conflict-${randomUUID()}`;
    const base = { type: 'EXPENSE' as const, accountId: bank.id, categoryId, transactionDate: '2026-08-10' };

    const settled = await Promise.allSettled([
      transactions.create(userId, { ...base, amountMinor: '100' }, key),
      transactions.create(userId, { ...base, amountMinor: '70' }, key),
    ]);

    expect(fulfilled(settled)).toHaveLength(1);
    expect(rejectedReasons(settled)).toEqual(['DUPLICATE_REQUEST']);
    expect(await prisma.db.transaction.count({ where: { userId, type: 'EXPENSE' } })).toBe(1);
  });

  it('replays a concurrent identical transfer instead of failing the replay with INSUFFICIENT_FUNDS', async () => {
    const userId = await createUser();
    const { accounts, transfers } = buildServices();
    const source = await accounts.create(userId, { name: 'Source', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' });
    const destination = await accounts.create(userId, { name: 'Destination', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' });
    const key = `concurrent-transfer-replay-${randomUUID()}`;
    const input = { fromAccountId: source.id, toAccountId: destination.id, amountMinor: '100', transactionDate: '2026-08-10' };

    const settled = await Promise.allSettled([
      transfers.create(userId, input, key),
      transfers.create(userId, input, key),
    ]);

    expect(rejectedReasons(settled)).toEqual([]);
    const created = fulfilled(settled);
    expect(created).toHaveLength(2);
    expect(created[0].transfer.id).toBe(created[1].transfer.id);
    expect(await prisma.db.transfer.count({ where: { userId } })).toBe(1);
    expect(await prisma.db.transaction.count({ where: { userId, type: 'TRANSFER' } })).toBe(2);
    expect((await accounts.get(userId, source.id)).balanceMinor).toBe('0');
    expect((await accounts.get(userId, destination.id)).balanceMinor).toBe('100');
  });

  it('rejects a concurrent reuse of one idempotency key with a different transfer payload', async () => {
    const userId = await createUser();
    const { accounts, transfers } = buildServices();
    const source = await accounts.create(userId, { name: 'Source', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100' });
    const destination = await accounts.create(userId, { name: 'Destination', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' });
    const key = `concurrent-transfer-conflict-${randomUUID()}`;
    const base = { fromAccountId: source.id, toAccountId: destination.id, transactionDate: '2026-08-10' };

    const settled = await Promise.allSettled([
      transfers.create(userId, { ...base, amountMinor: '100' }, key),
      transfers.create(userId, { ...base, amountMinor: '70' }, key),
    ]);

    expect(fulfilled(settled)).toHaveLength(1);
    expect(rejectedReasons(settled)).toEqual(['DUPLICATE_REQUEST']);
    expect(await prisma.db.transfer.count({ where: { userId } })).toBe(1);
    expect(await prisma.db.transaction.count({ where: { userId, type: 'TRANSFER' } })).toBe(2);
  });

  it('rejects a concurrent reuse of one idempotency key across different accounts', async () => {
    const userId = await createUser();
    const { accounts, transactions } = buildServices();
    const first = await accounts.create(userId, { name: 'First', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '0' });
    const second = await accounts.create(userId, { name: 'Second', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' });
    const key = `concurrent-cross-account-${randomUUID()}`;

    // Different accounts never share the same row lock, so the two writes are not
    // serialized: whoever loses either observes the committed row or the unique
    // index on (user_id, idempotency_key), and both encode the same contract.
    const settled = await Promise.allSettled([
      transactions.create(userId, { type: 'INCOME', accountId: first.id, amountMinor: '10', transactionDate: '2026-08-10' }, key),
      transactions.create(userId, { type: 'INCOME', accountId: second.id, amountMinor: '20', transactionDate: '2026-08-10' }, key),
    ]);

    expect(fulfilled(settled)).toHaveLength(1);
    expect(rejectedReasons(settled)).toEqual(['DUPLICATE_REQUEST']);
    expect(await prisma.db.transaction.count({ where: { userId } })).toBe(1);
  });

  it('hides another user resources behind 404', async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const { accounts } = buildServices();
    const bank = await accounts.create(owner, { name: 'Private', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '1000' });

    await expect(accounts.get(intruder, bank.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('computes budget usage from persisted expenses inside the month window only', async () => {
    const userId = await createUser();
    const { accounts, transactions, budgets } = buildServices();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '100000' });
    const categoryId = randomUUID();
    await prisma.db.category.create({ data: { id: categoryId, userId, name: 'Groceries', type: 'EXPENSE', isSystem: false, status: 'ACTIVE' } });

    const budget = await budgets.create(userId, { categoryId, year: 2026, month: 8, limitMinor: '10000' });
    const expense = await transactions.create(userId, { type: 'EXPENSE', accountId: bank.id, categoryId, amountMinor: '2500', transactionDate: '2026-08-15' });
    // February row: the August budget must ignore it (F-019 month bounds).
    await transactions.create(userId, { type: 'EXPENSE', accountId: bank.id, categoryId, amountMinor: '4444', transactionDate: '2026-02-27' });
    await transactions.void(userId, expense.id);

    expect(budget.spentMinor).toBe('0');
    expect((await budgets.list(userId)).find((item) => item.categoryId === categoryId)?.spentMinor).toBe('0');
  });

  it('derives savings-goal progress from the live account balance', async () => {
    const userId = await createUser();
    const { accounts, transactions, goals } = buildServices();
    const savings = await accounts.create(userId, { name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '0' });
    const goal = await goals.create(userId, { accountId: savings.id, name: 'Laptop', targetAmountMinor: '1000' });

    expect(goal.progressPercent).toBe(0);
    await transactions.create(userId, { type: 'INCOME', accountId: savings.id, amountMinor: '500', transactionDate: '2026-08-10' });

    expect((await goals.get(userId, goal.id)).progressPercent).toBe(50);
  });
});