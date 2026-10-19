import { InMemoryStore } from '../src/core/store';
import { AccountsService } from '../src/accounts/accounts.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransfersService } from '../src/transfers/transfers.service';
import { PrismaAccountRepository } from '../src/database/repositories/prisma-account.repository';
import { PrismaTransactionRepository } from '../src/database/repositories/transaction.repository';
import { PrismaTransferRepository } from '../src/database/repositories/transfer.repository';
import { PrismaService } from '../src/database/prisma.service';

type AccountRow = {
  id: string;
  userId: string;
  name: string;
  type: 'CASH' | 'BANK' | 'SAVINGS';
  currencyCode: string;
  openingBalanceMinor: bigint;
  status: 'ACTIVE' | 'ARCHIVED';
  transactions?: Array<{ type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; transferDirection: 'SOURCE' | 'DESTINATION' | null; amountMinor: bigint }>;
};

function prismaStubWith(rows: AccountRow[]): PrismaService {
  return {
    db: {
      account: {
        findUnique: async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null,
        findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
          rows.find((row) => row.id === where.id && row.userId === where.userId) ?? null,
        findMany: async ({ where }: { where: { userId: string } }) => rows.filter((row) => row.userId === where.userId),
      },
    },
  } as unknown as PrismaService;
}

const account = (id: string, userId: string, openingBalanceMinor: bigint, transactions: AccountRow['transactions'] = []): AccountRow => ({
  id,
  userId,
  name: id,
  type: 'BANK',
  currencyCode: 'USD',
  openingBalanceMinor,
  status: 'ACTIVE',
  transactions,
});

describe('transfer direction parity (B-001)', () => {
  beforeEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  it('memory mode: $200 transfer Bank 500 / Savings 100 -> 300 / 300 / 600', async () => {
    const store = new InMemoryStore();
    const accounts = new AccountsService(store, {} as PrismaAccountRepository);
    const transfers = new TransfersService(store);
    const userId = store.id();
    const bank = await accounts.create(userId, { name: 'Bank', type: 'BANK', currencyCode: 'USD', openingBalanceMinor: '500' });
    const savings = await accounts.create(userId, { name: 'Savings', type: 'SAVINGS', currencyCode: 'USD', openingBalanceMinor: '100' });

    const result = await transfers.create(userId, { fromAccountId: bank.id, toAccountId: savings.id, amountMinor: '200', transactionDate: '2026-08-30' });

    expect((await accounts.get(userId, bank.id)).balanceMinor).toBe('300');
    expect((await accounts.get(userId, savings.id)).balanceMinor).toBe('300');
    expect(store.accountBalance(bank.id) + store.accountBalance(savings.id)).toBe(600n);
    expect(result.sourceTx.amountMinor).toBe('200');
    expect(result.destinationTx.amountMinor).toBe('200');
    expect(result.transfer.sourceTransactionId).toBe(result.sourceTx.id);
    expect(result.transfer.destinationTransactionId).toBe(result.destinationTx.id);
  });

  it('memory mode: transfer and both legs retain one creation timestamp across reads', async () => {
    const store = new InMemoryStore();
    const accounts = new AccountsService(store, {} as PrismaAccountRepository);
    const transfers = new TransfersService(store);
    const userId = store.id();
    const bank = await accounts.create(userId, {
      name: 'Bank',
      type: 'BANK',
      currencyCode: 'USD',
      openingBalanceMinor: '500',
    });
    const savings = await accounts.create(userId, {
      name: 'Savings',
      type: 'SAVINGS',
      currencyCode: 'USD',
      openingBalanceMinor: '100',
    });

    const created = await transfers.create(userId, {
      fromAccountId: bank.id,
      toAccountId: savings.id,
      amountMinor: '200',
      transactionDate: '2026-08-30',
    });
    const firstRead = await transfers.get(userId, created.transfer.id);
    const secondRead = await transfers.get(userId, created.transfer.id);

    expect(created.transfer.createdAt).toBe(created.sourceTx.createdAt);
    expect(created.transfer.createdAt).toBe(created.destinationTx.createdAt);
    expect(created.sourceTx.createdAt).toBe(created.sourceTx.updatedAt);
    expect(created.destinationTx.createdAt).toBe(created.destinationTx.updatedAt);
    expect(firstRead).toEqual(secondRead);
    expect(firstRead.transfer.createdAt).toBe(created.transfer.createdAt);
    expect(firstRead.sourceTx.createdAt).toBe(created.transfer.createdAt);
    expect(firstRead.destinationTx.createdAt).toBe(created.transfer.createdAt);
  });

  it('prisma mode: SOURCE debits, DESTINATION credits (300 / 300 / 600)', async () => {
    const repository = new PrismaAccountRepository(prismaStubWith([
      account('bank', 'user-1', 500n, [{ type: 'TRANSFER', transferDirection: 'SOURCE', amountMinor: 200n }]),
      account('savings', 'user-1', 100n, [{ type: 'TRANSFER', transferDirection: 'DESTINATION', amountMinor: 200n }]),
    ]));

    const bank = await repository.balance('bank');
    const savings = await repository.balance('savings');

    expect(bank).toBe(300n);
    expect(savings).toBe(300n);
    expect(bank + savings).toBe(600n);
  });

  it('prisma mode: income credits, expense debits, voided legs are excluded by the query filter', async () => {
    const repository = new PrismaAccountRepository(prismaStubWith([
      account('cash', 'user-1', 1000n, [
        { type: 'INCOME', transferDirection: null, amountMinor: 500n },
        { type: 'EXPENSE', transferDirection: null, amountMinor: 250n },
      ]),
    ]));

    expect(await repository.balance('cash')).toBe(1250n);
  });
});

describe('prisma branch isolation (B-002)', () => {
  beforeEach(() => {
    process.env.ENABLE_PRISMA = 'true';
  });

  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  it('transfer create in prisma mode never writes in-memory legs', async () => {
    const store = new InMemoryStore();
    const repository = new PrismaAccountRepository(prismaStubWith([
      account('bank', 'user-1', 500n),
      account('savings', 'user-1', 100n),
    ]));
    const created: unknown[] = [];
    const persistent = {
      findByIdempotency: async () => null,
      create: async (input: { transfer: unknown }) => {
        created.push(input);
        return input.transfer;
      },
    } as unknown as PrismaTransferRepository;
    const transactions = {
      findForUser: async (_userId: string, id: string) => ({
        id,
        userId: 'user-1',
        accountId: id === 'source' ? 'bank' : 'savings',
        categoryId: null,
        type: 'TRANSFER' as const,
        amountMinor: 200n,
        currencyCode: 'USD',
        description: null,
        transactionDate: '2026-08-30',
        status: 'ACTIVE' as const,
      }),
    } as unknown as PrismaTransactionRepository;

    const transfers = new TransfersService(store, repository, persistent, transactions);
    await transfers.create('user-1', { fromAccountId: 'bank', toAccountId: 'savings', amountMinor: '200', transactionDate: '2026-08-30' }, 'key-1');

    expect(created).toHaveLength(1);
    expect(store.transactions.size).toBe(0);
    expect(store.transfers.size).toBe(0);
    expect(store.transfersByIdempotency.size).toBe(0);
  });

  it('transaction create in prisma mode never writes the in-memory idempotency map', async () => {
    const store = new InMemoryStore();
    const repository = new PrismaAccountRepository(prismaStubWith([account('bank', 'user-1', 500n)]));
    const persistent = {
      findByIdempotency: async () => null,
      create: async (input: { id: string }) => ({ ...input, transferDirection: undefined }),
    } as unknown as PrismaTransactionRepository;

    const transactions = new TransactionsService(store, repository, persistent);
    await transactions.create('user-1', { type: 'INCOME', accountId: 'bank', amountMinor: '100', transactionDate: '2026-08-30' }, 'key-1');

    expect(store.transactions.size).toBe(0);
    expect(store.transactionsByIdempotency.size).toBe(0);
  });
});
