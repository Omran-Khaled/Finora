import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { InMemoryStore, TransactionRecord, TransferRecord } from '../src/core/store';
import { AuthGuard } from '../src/auth/auth.guard';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransfersController } from '../src/transfers/transfers.controller';
import { TransfersService } from '../src/transfers/transfers.service';
import { PrismaTransactionRepository } from '../src/database/repositories/transaction.repository';
import { PrismaTransferRepository } from '../src/database/repositories/transfer.repository';

const originalPrismaSetting = process.env.ENABLE_PRISMA;

function transactionFixture(
  id: string,
  accountId: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    userId: 'user-1',
    accountId,
    categoryId: null,
    type: 'INCOME',
    amountMinor: 10n,
    currencyCode: 'USD',
    description: null,
    transactionDate: '2026-10-01',
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('void response timestamps and OpenAPI example', () => {
  afterEach(() => {
    jest.useRealTimers();
    if (originalPrismaSetting === undefined) delete process.env.ENABLE_PRISMA;
    else process.env.ENABLE_PRISMA = originalPrismaSetting;
  });

  it('advances updatedAt for an in-memory transaction void', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    delete process.env.ENABLE_PRISMA;
    const store = new InMemoryStore();
    const transaction = transactionFixture('transaction-1', 'account-1', {
      type: 'EXPENSE',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    store.transactions.set(transaction.id, transaction);
    const service = new TransactionsService(store);

    const result = await service.void(transaction.userId, transaction.id);

    expect(result.status).toBe('VOIDED');
    expect(result.updatedAt).not.toBe(transaction.createdAt);
    expect(result.updatedAt).toBe(transaction.updatedAt);
    expect(result.updatedAt).toBe('2026-10-15T12:00:00.000Z');
    expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(
      new Date('2026-10-01T00:00:00.000Z').getTime(),
    );
  });

  it('returns the updated timestamp supplied by the persistent transaction write', async () => {
    process.env.ENABLE_PRISMA = 'true';
    const store = new InMemoryStore();
    const before = transactionFixture('transaction-2', 'account-2');
    const persisted = {
      ...before,
      status: 'VOIDED' as const,
      updatedAt: '2026-10-15T12:00:00.000Z',
    };
    const repository = {
      findForUser: jest.fn().mockResolvedValue(before),
      voidIfActive: jest.fn().mockResolvedValue(persisted),
    } as unknown as PrismaTransactionRepository;
    const service = new TransactionsService(store, undefined, repository);

    const result = await service.void(before.userId, before.id);

    expect(result.status).toBe('VOIDED');
    expect(result.updatedAt).toBe(persisted.updatedAt);
    expect(store.transactions.has(before.id)).toBe(false);
  });

  it('advances both in-memory transfer-leg timestamps together when voided', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    delete process.env.ENABLE_PRISMA;
    const store = new InMemoryStore();
    const service = new TransfersService(store);
    const userId = store.id();
    const sourceAccountId = store.id();
    const destinationAccountId = store.id();
    store.accounts.set(sourceAccountId, {
      id: sourceAccountId,
      userId,
      name: 'Source',
      type: 'BANK',
      currencyCode: 'USD',
      openingBalanceMinor: 100n,
      status: 'ACTIVE',
    });
    store.accounts.set(destinationAccountId, {
      id: destinationAccountId,
      userId,
      name: 'Destination',
      type: 'SAVINGS',
      currencyCode: 'USD',
      openingBalanceMinor: 0n,
      status: 'ACTIVE',
    });
    const created = await service.create(userId, {
      fromAccountId: sourceAccountId,
      toAccountId: destinationAccountId,
      amountMinor: '10',
      transactionDate: '2026-10-01',
    });
    const oldTimestamp = '2026-10-01T00:00:00.000Z';
    const source = store.transactions.get(created.sourceTx.id)!;
    const destination = store.transactions.get(created.destinationTx.id)!;
    source.updatedAt = oldTimestamp;
    destination.updatedAt = oldTimestamp;

    const result = await service.void(userId, created.transfer.id);

    expect(result.sourceTx.status).toBe('VOIDED');
    expect(result.destinationTx.status).toBe('VOIDED');
    expect(result.sourceTx.updatedAt).toBe('2026-10-15T12:00:00.000Z');
    expect(result.sourceTx.updatedAt).not.toBe(oldTimestamp);
    expect(result.destinationTx.updatedAt).toBe(result.sourceTx.updatedAt);
  });

  it('returns persisted timestamps for both persistent transfer legs', async () => {
    process.env.ENABLE_PRISMA = 'true';
    const userId = 'user-2';
    const transfer: TransferRecord = {
      id: 'transfer-1',
      userId,
      sourceTransactionId: 'source-1',
      destinationTransactionId: 'destination-1',
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    const source = transactionFixture('source-1', 'account-1', {
      userId,
      type: 'TRANSFER',
      status: 'VOIDED',
      transferDirection: 'SOURCE',
      updatedAt: '2026-10-15T12:00:00.000Z',
    });
    const destination = transactionFixture('destination-1', 'account-2', {
      userId,
      type: 'TRANSFER',
      status: 'VOIDED',
      transferDirection: 'DESTINATION',
      updatedAt: '2026-10-15T12:00:00.000Z',
    });
    const persistent = {
      findForUser: jest.fn().mockResolvedValue(transfer),
      voidIfActive: jest.fn().mockResolvedValue(true),
    } as unknown as PrismaTransferRepository;
    const transactions = {
      findForUser: jest.fn()
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(destination),
    } as unknown as PrismaTransactionRepository;
    const service = new TransfersService(
      new InMemoryStore(),
      undefined,
      persistent,
      transactions,
    );

    const result = await service.void(userId, transfer.id);

    expect(result.sourceTx.status).toBe('VOIDED');
    expect(result.destinationTx.status).toBe('VOIDED');
    expect(result.sourceTx.updatedAt).toBe(source.updatedAt);
    expect(result.destinationTx.updatedAt).toBe(destination.updatedAt);
  });

  it('documents both transfer legs as VOIDED in the void operation example', async () => {
    const module = await Test.createTestingModule({
      controllers: [TransfersController],
      providers: [{ provide: TransfersService, useValue: {} }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Finora test').setVersion('1').build(),
    );
    const response = (document.paths['/transfers/{id}/void'].post?.responses?.['200']) as
      | { content?: Record<string, { example?: unknown }> }
      | undefined;
    const example = response?.content?.['application/json']?.example as {
      data: { sourceTx: { status: string }; destinationTx: { status: string } };
    };

    expect(example.data.sourceTx.status).toBe('VOIDED');
    expect(example.data.destinationTx.status).toBe('VOIDED');
    await app.close();
  });
});
