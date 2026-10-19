import { UnprocessableEntityException } from '@nestjs/common';
import { InMemoryStore } from '../src/core/store';
import { AccountsService } from '../src/accounts/accounts.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransfersService } from '../src/transfers/transfers.service';
import { PrismaAccountRepository } from '../src/database/repositories/prisma-account.repository';
import { AuthService } from '../src/auth/auth.service';
import { PrismaAuthRepository } from '../src/auth/auth.repository';

describe('financial scenarios', () => {
  const previousEnv = process.env.ENABLE_PRISMA;
  beforeEach(() => {
    delete process.env.ENABLE_PRISMA;
  });
  afterAll(() => {
    if (previousEnv === undefined) delete process.env.ENABLE_PRISMA;
    else process.env.ENABLE_PRISMA = previousEnv;
  });
  async function setup() {
    const store = new InMemoryStore();
    const accounts = new AccountsService(store, {} as PrismaAccountRepository);
    const transactions = new TransactionsService(store);
    const transfers = new TransfersService(store);
    const userId = store.id();
    const user = { id: userId, email: `${userId}@test.invalid`, passwordHash: 'fixture', baseCurrency: 'USD' };
    store.users.set(userId, user);
    store.usersByEmail.set(user.email, user);
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '500' });
    const savings = await accounts.create(userId, { name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '100' });
    return { store, accounts, transactions, transfers, userId, bank, savings };
  }

  it('preserves total money during a transfer and is idempotent', async () => {
    const { accounts, transfers, userId, bank, savings } = await setup();
    const first = await transfers.create(userId, { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '200', transactionDate: '2026-08-30' }, 'transfer-1');
    const second = await transfers.create(userId, { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '200', transactionDate: '2026-08-30' }, 'transfer-1');
    expect(first.transfer.id).toBe(second.transfer.id);
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('300');
    expect((await accounts.get(userId, savings.id)).balanceMinor).toBe('300');
  });

  it('rejects an expense without mutating the account', async () => {
    const { accounts, transactions, userId, bank } = await setup();
    await expect(transactions.create(userId, { type: 'EXPENSE', accountId: bank.id, amountMinor: '600', transactionDate: '2026-08-30' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('500');
  });

  it('prevents voiding income when that would make the account balance negative', async () => {
    const { accounts, transactions, userId, bank, store } = await setup();
    const categoryId = [...store.categories.values()].find((category) => category.type === 'EXPENSE')?.id;
    if (!categoryId) throw new Error('Missing fixture expense category.');
    const income = await transactions.create(userId, {
      type: 'INCOME',
      accountId: bank.id,
      amountMinor: '20',
      transactionDate: '2026-08-30',
    });
    await transactions.create(userId, {
      type: 'EXPENSE',
      accountId: bank.id,
      categoryId,
      amountMinor: '520',
      transactionDate: '2026-08-30',
    });

    await expect(transactions.void(userId, income.id)).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_FUNDS' },
    });
    expect((await transactions.get(userId, income.id)).status).toBe('ACTIVE');
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('0');
  });

  it('rejects standalone void of a transfer leg and keeps both legs active', async () => {
    const { accounts, transactions, transfers, userId, bank, savings } = await setup();
    const result = await transfers.create(userId, {
      fromAccountId: bank.id,
      toAccountId: savings.id,
      amountMinor: '200',
      transactionDate: '2026-08-30',
    });

    await expect(transactions.void(userId, result.sourceTx.id)).rejects.toMatchObject({
      response: { code: 'INVALID_TRANSFER' },
    });
    expect((await transactions.get(userId, result.sourceTx.id)).status).toBe('ACTIVE');
    expect((await transactions.get(userId, result.destinationTx.id)).status).toBe('ACTIVE');
  });

  it('prevents transfer void when removing its destination credit would overdraw', async () => {
    const { accounts, transactions, transfers, userId, bank, savings, store } = await setup();
    const categoryId = [...store.categories.values()].find((category) => category.type === 'EXPENSE')?.id;
    if (!categoryId) throw new Error('Missing fixture expense category.');
    const result = await transfers.create(userId, {
      fromAccountId: bank.id,
      toAccountId: savings.id,
      amountMinor: '200',
      transactionDate: '2026-08-30',
    });
    await transactions.create(userId, {
      type: 'EXPENSE',
      accountId: savings.id,
      categoryId,
      amountMinor: '300',
      transactionDate: '2026-08-30',
    });

    await expect(transfers.void(userId, result.transfer.id)).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_FUNDS' },
    });
    expect((await transactions.get(userId, result.sourceTx.id)).status).toBe('ACTIVE');
    expect((await transactions.get(userId, result.destinationTx.id)).status).toBe('ACTIVE');
    expect((await accounts.get(userId, savings.id)).balanceMinor).toBe('0');
  });

  it('binds transaction and transfer idempotency keys to their payloads', async () => {
    const { accounts, transactions, transfers, userId, bank, savings } = await setup();
    const income = await transactions.create(
      userId,
      { type: 'INCOME', accountId: bank.id, amountMinor: '25', transactionDate: '2026-08-30' },
      'transaction-1',
    );
    const replay = await transactions.create(
      userId,
      { type: 'INCOME', accountId: bank.id, amountMinor: '25', transactionDate: '2026-08-30' },
      'transaction-1',
    );
    expect(replay.id).toBe(income.id);
    await expect(transactions.create(
      userId,
      { type: 'INCOME', accountId: bank.id, amountMinor: '26', transactionDate: '2026-08-30' },
      'transaction-1',
    )).rejects.toMatchObject({ response: { code: 'DUPLICATE_REQUEST' } });

    const transfer = await transfers.create(
      userId,
      { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '10', transactionDate: '2026-08-30' },
      'transfer-1',
    );
    const transferReplay = await transfers.create(
      userId,
      { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '10', transactionDate: '2026-08-30' },
      'transfer-1',
    );
    expect(transferReplay.transfer.id).toBe(transfer.transfer.id);
    await expect(transfers.create(
      userId,
      { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '11', transactionDate: '2026-08-30' },
      'transfer-1',
    )).rejects.toMatchObject({ response: { code: 'DUPLICATE_REQUEST' } });
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('515');
  });

  it('rejects accounts outside the user base currency and leaves state unchanged', async () => {
    const { accounts, userId } = await setup();
    await expect(accounts.create(userId, {
      name: 'Euro account',
      type: 'BANK',
      currencyCode: 'EUR',
      openingBalanceMinor: '100',
    })).rejects.toMatchObject({ response: { code: 'BASE_CURRENCY_MISMATCH' } });
    expect(await accounts.list(userId)).toHaveLength(2);
  });

  it('serializes concurrent account creation and base-currency changes', async () => {
    const store = new InMemoryStore();
    const accounts = new AccountsService(store, {} as PrismaAccountRepository);
    const auth = new AuthService(store, {} as PrismaAuthRepository);
    const userId = store.id();
    const user = { id: userId, email: `${userId}@test.invalid`, passwordHash: 'fixture', baseCurrency: 'USD' };
    store.users.set(userId, user);
    store.usersByEmail.set(user.email, user);

    const results = await Promise.allSettled([
      accounts.create(userId, { name: 'USD account', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '1' }),
      auth.updateProfile(userId, 'EUR'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const currentUser = store.users.get(userId);
    const createdAccounts = [...store.accounts.values()];
    expect(createdAccounts.every((account) => account.currencyCode === currentUser?.baseCurrency)).toBe(true);
  });

  it('rejects ambiguous legacy idempotency rows and does not create duplicates concurrently', async () => {
    const { store, accounts, transactions, transfers, userId, bank, savings } = await setup();
    const input = { type: 'INCOME' as const, accountId: bank.id, amountMinor: '25', transactionDate: '2026-08-30' };
    const first = await transactions.create(userId, input, 'legacy-key');
    // Simulate a pre-0006 row whose nullable fingerprint was never backfilled.
    store.transactionIdempotencyFingerprints.delete(`${userId}:legacy-key`);
    await expect(transactions.create(userId, input, 'legacy-key')).rejects.toMatchObject({
      response: { code: 'DUPLICATE_REQUEST' },
    });
    const replays = await Promise.all(
      Array.from({ length: 8 }, () => transactions.create(userId, input, 'new-key')),
    );
    expect(new Set(replays.map((item) => item.id)).size).toBe(1);
    const transferReplays = await Promise.all(
      Array.from({ length: 8 }, () => transfers.create(
        userId,
        { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '10', transactionDate: '2026-08-30' },
        'concurrent-transfer',
      )),
    );
    expect(new Set(transferReplays.map((item) => item.transfer.id)).size).toBe(1);
    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('540');
    expect((await accounts.get(userId, savings.id)).balanceMinor).toBe('110');
    expect(first.id).not.toBe(replays[0].id);
  });

  it('resolves real account objects (not promises) from list in persistent mode', async () => {
    const store = new InMemoryStore();
    const userId = store.id();
    const user = { id: userId, email: `${userId}@test.invalid`, passwordHash: 'fixture', baseCurrency: 'USD' };
    store.users.set(userId, user);
    store.usersByEmail.set(user.email, user);
    const accounts = new AccountsService(store, {} as PrismaAccountRepository);
    await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '500' });

    const previous = process.env.ENABLE_PRISMA;
    process.env.ENABLE_PRISMA = 'true';
    // Minimal persistent stub: balances pre-resolved so viewPersistent has no
    // per-row fetch; the regression is that list() must await the async mapper.
    const persistent = {
      listForUser: async () => ({
        data: [
          {
            id: 'acc-1',
            userId,
            name: 'Bank',
            type: 'BANK' as const,
            currencyCode: 'USD',
            openingBalanceMinor: 500n,
            status: 'ACTIVE' as const,
          },
        ],
        nextCursor: null,
      }),
      balancesForUser: async () => new Map([['acc-1', 500n]]),
    };
    const persistentAccounts = new AccountsService(
      store,
      persistent as unknown as PrismaAccountRepository,
    );
    try {
      const listed = await persistentAccounts.list(userId);
      expect(listed).toHaveLength(1);
      // Before the fix this was a Promise (serialized as {} -> missing
      // balanceMinor -> dashboard "accounts[].balanceMinor" error).
      expect(listed[0]).not.toBeInstanceOf(Promise);
      expect(listed[0].balanceMinor).toBe('500');
      expect(listed[0].openingBalanceMinor).toBe('500');
      const paged = await persistentAccounts.listPaged(userId, {});
      expect(paged.data).toHaveLength(1);
      expect(paged.data[0]).not.toBeInstanceOf(Promise);
      expect(paged.data[0].balanceMinor).toBe('500');
    } finally {
      if (previous === undefined) delete process.env.ENABLE_PRISMA;
      else process.env.ENABLE_PRISMA = previous;
    }
  });
});
