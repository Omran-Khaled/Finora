import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateTransactionRequest,
  CreateTransferRequest,
  Transaction,
  TransferCreationResult,
  User,
} from '@/lib/types';
import { api } from '@/lib/api-client';
import { mockApi } from '@/lib/mock-adapter';
import { clearSession, saveSession } from '@/lib/session-store';

describe('financial intent idempotency at the Web API facade', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('reuses a transaction key after an ambiguous failure, but changes it for edits and later intents', async () => {
    saveSession('transaction-flow-token', { id: 'transaction-flow-user' } as User);
    const request: CreateTransactionRequest = {
      type: 'EXPENSE',
      accountId: 'account-1',
      categoryId: 'category-1',
      amountMinor: '500',
      description: 'Lunch',
      transactionDate: '2026-10-15',
    };
    const editedRequest = { ...request, amountMinor: '600' };
    const committedResult = {} as Transaction;
    const create = vi
      .spyOn(mockApi.transactions, 'create')
      .mockRejectedValueOnce(new TypeError('A response was lost.'))
      .mockRejectedValueOnce(new TypeError('B response was lost.'))
      .mockResolvedValueOnce(committedResult)
      .mockRejectedValueOnce(new TypeError('A retry response was lost.'))
      .mockResolvedValue(committedResult);

    await expect(api.transactions.create(request)).rejects.toThrow('A response was lost');
    await expect(api.transactions.create(editedRequest)).rejects.toThrow('B response was lost');
    await expect(api.transactions.create(editedRequest)).resolves.toBe(committedResult);
    await expect(api.transactions.create({ ...request })).rejects.toThrow(
      'A retry response was lost',
    );
    await expect(api.transactions.create({ ...editedRequest, amountMinor: '700' })).resolves.toBe(
      committedResult,
    );
    await expect(api.transactions.create({ ...request })).resolves.toBe(committedResult);
    await expect(api.transactions.create(request)).resolves.toBe(committedResult);

    const calls = create.mock.calls;
    expect(calls.map(([payload]) => payload)).toEqual([
      request,
      editedRequest,
      editedRequest,
      request,
      { ...editedRequest, amountMinor: '700' },
      request,
      request,
    ]);
    expect(calls[0]?.[1]).toBe(calls[1]?.[1]);
    expect(calls[1]?.[1]).toBe(calls[2]?.[1]);
    expect(calls[0]?.[1]).toBe(calls[3]?.[1]);
    expect(calls[4]?.[1]).not.toBe(calls[1]?.[1]);
    expect(calls[5]?.[1]).toBe(calls[0]?.[1]);
    expect(calls[6]?.[1]).not.toBe(calls[0]?.[1]);
    expect(calls[6]?.[1]).not.toBe(calls[4]?.[1]);
  });

  it('reuses a transfer key after an ambiguous failure, but changes it for edits and later intents', async () => {
    saveSession('transfer-flow-token', { id: 'transfer-flow-user' } as User);
    const request: CreateTransferRequest = {
      fromAccountId: 'account-1',
      toAccountId: 'account-2',
      amountMinor: '500',
      transactionDate: '2026-10-15',
    };
    const editedRequest = { ...request, amountMinor: '600' };
    const committedResult = {} as TransferCreationResult;
    const create = vi
      .spyOn(mockApi.transfers, 'create')
      .mockRejectedValueOnce(new TypeError('A response was lost.'))
      .mockRejectedValueOnce(new TypeError('B response was lost.'))
      .mockResolvedValueOnce(committedResult)
      .mockRejectedValueOnce(new TypeError('A retry response was lost.'))
      .mockResolvedValue(committedResult);

    await expect(api.transfers.create(request)).rejects.toThrow('A response was lost');
    await expect(api.transfers.create(editedRequest)).rejects.toThrow('B response was lost');
    await expect(api.transfers.create(editedRequest)).resolves.toBe(committedResult);
    await expect(api.transfers.create({ ...request })).rejects.toThrow(
      'A retry response was lost',
    );
    await expect(api.transfers.create({ ...editedRequest, amountMinor: '700' })).resolves.toBe(
      committedResult,
    );
    await expect(api.transfers.create({ ...request })).resolves.toBe(committedResult);
    await expect(api.transfers.create(request)).resolves.toBe(committedResult);

    const calls = create.mock.calls;
    expect(calls.map(([payload]) => payload)).toEqual([
      request,
      editedRequest,
      editedRequest,
      request,
      { ...editedRequest, amountMinor: '700' },
      request,
      request,
    ]);
    expect(calls[0]?.[1]).toBe(calls[1]?.[1]);
    expect(calls[1]?.[1]).toBe(calls[2]?.[1]);
    expect(calls[0]?.[1]).toBe(calls[3]?.[1]);
    expect(calls[4]?.[1]).not.toBe(calls[1]?.[1]);
    expect(calls[5]?.[1]).toBe(calls[0]?.[1]);
    expect(calls[6]?.[1]).not.toBe(calls[0]?.[1]);
    expect(calls[6]?.[1]).not.toBe(calls[4]?.[1]);
  });

  it('does not reuse or clear unresolved keys when the authenticated user changes', async () => {
    const request: CreateTransactionRequest = {
      type: 'EXPENSE',
      accountId: 'account-switch',
      categoryId: 'category-switch',
      amountMinor: '250',
      description: 'User-scoped intent',
      transactionDate: '2026-10-15',
    };
    const result = {} as Transaction;
    const create = vi
      .spyOn(mockApi.transactions, 'create')
      .mockRejectedValueOnce(new TypeError('Ambiguous failure.'))
      .mockResolvedValue(result);

    saveSession('user-a-token', { id: 'user-a' } as User);
    await expect(api.transactions.create(request)).rejects.toThrow('Ambiguous failure');
    saveSession('user-b-token', { id: 'user-b' } as User);
    await expect(api.transactions.create(request)).resolves.toBe(result);
    saveSession('user-a-token-again', { id: 'user-a' } as User);
    await expect(api.transactions.create(request)).resolves.toBe(result);

    const calls = create.mock.calls;
    expect(calls[0]?.[1]).not.toBe(calls[1]?.[1]);
    expect(calls[0]?.[1]).toBe(calls[2]?.[1]);
  });
});
