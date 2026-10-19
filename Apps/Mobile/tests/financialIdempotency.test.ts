import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type {
  CreateTransactionRequest,
  CreateTransferRequest,
  Transaction,
} from '../types/contract';
import type { TransferCreationResult } from '../lib/api/adapter';
import { api } from '../lib/api/apiClient';
import { SecureStorage } from '../lib/storage/secureStorage';

describe('financial intent idempotency at the Mobile API facade', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await SecureStorage.clearSession();
  });

  it('reuses a transaction key after an ambiguous failure, but changes it for edits and later intents', async () => {
    await SecureStorage.setItem(
      'session_user',
      JSON.stringify({ id: 'transaction-flow-user' }),
    );
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
    const create = jest
      .spyOn(api.getAdapter(), 'createTransaction')
      .mockRejectedValueOnce(new TypeError('A response was lost.'))
      .mockRejectedValueOnce(new TypeError('B response was lost.'))
      .mockResolvedValueOnce({ data: committedResult })
      .mockRejectedValueOnce(new TypeError('A retry response was lost.'))
      .mockResolvedValue({ data: committedResult });

    await expect(api.createTransaction(request)).rejects.toMatchObject({
      error: { code: 'NETWORK_ERROR' },
    });
    await expect(api.createTransaction(editedRequest)).rejects.toMatchObject({
      error: { code: 'NETWORK_ERROR' },
    });
    await expect(api.createTransaction(editedRequest)).resolves.toBe(committedResult);
    await expect(api.createTransaction({ ...request })).rejects.toMatchObject({
      error: { code: 'NETWORK_ERROR' },
    });
    await expect(
      api.createTransaction({ ...editedRequest, amountMinor: '700' }),
    ).resolves.toBe(committedResult);
    await expect(api.createTransaction({ ...request })).resolves.toBe(committedResult);
    await expect(api.createTransaction(request)).resolves.toBe(committedResult);

    const calls = create.mock.calls as unknown as [string, CreateTransactionRequest, string][];
    expect(calls.map(([, payload]) => payload)).toEqual([
      request,
      editedRequest,
      editedRequest,
      request,
      { ...editedRequest, amountMinor: '700' },
      request,
      request,
    ]);
    expect(calls[0]?.[2]).toBe(calls[3]?.[2]);
    expect(calls[1]?.[2]).toBe(calls[2]?.[2]);
    expect(calls[4]?.[2]).not.toBe(calls[1]?.[2]);
    expect(calls[5]?.[2]).toBe(calls[0]?.[2]);
    expect(calls[6]?.[2]).not.toBe(calls[0]?.[2]);
    expect(calls[6]?.[2]).not.toBe(calls[4]?.[2]);
  });

  it('reuses a transfer key after an ambiguous failure, but changes it for edits and later intents', async () => {
    await SecureStorage.setItem(
      'session_user',
      JSON.stringify({ id: 'transfer-flow-user' }),
    );
    const request: CreateTransferRequest = {
      fromAccountId: 'account-1',
      toAccountId: 'account-2',
      amountMinor: '500',
      transactionDate: '2026-10-15',
    };
    const editedRequest = { ...request, amountMinor: '600' };
    const committedResult = {} as TransferCreationResult;
    const create = jest
      .spyOn(api.getAdapter(), 'createTransfer')
      .mockRejectedValueOnce(new TypeError('A response was lost.'))
      .mockRejectedValueOnce(new TypeError('B response was lost.'))
      .mockResolvedValueOnce({ data: committedResult })
      .mockRejectedValueOnce(new TypeError('A retry response was lost.'))
      .mockResolvedValue({ data: committedResult });

    await expect(api.createTransfer(request)).rejects.toMatchObject({
      error: { code: 'NETWORK_ERROR' },
    });
    await expect(api.createTransfer(editedRequest)).rejects.toMatchObject({
      error: { code: 'NETWORK_ERROR' },
    });
    await expect(api.createTransfer(editedRequest)).resolves.toBe(committedResult);
    await expect(api.createTransfer({ ...request })).rejects.toMatchObject({
      error: { code: 'NETWORK_ERROR' },
    });
    await expect(
      api.createTransfer({ ...editedRequest, amountMinor: '700' }),
    ).resolves.toBe(committedResult);
    await expect(api.createTransfer({ ...request })).resolves.toBe(committedResult);
    await expect(api.createTransfer(request)).resolves.toBe(committedResult);

    const calls = create.mock.calls as unknown as [string, CreateTransferRequest, string][];
    expect(calls.map(([, payload]) => payload)).toEqual([
      request,
      editedRequest,
      editedRequest,
      request,
      { ...editedRequest, amountMinor: '700' },
      request,
      request,
    ]);
    expect(calls[0]?.[2]).toBe(calls[3]?.[2]);
    expect(calls[1]?.[2]).toBe(calls[2]?.[2]);
    expect(calls[4]?.[2]).not.toBe(calls[1]?.[2]);
    expect(calls[5]?.[2]).toBe(calls[0]?.[2]);
    expect(calls[6]?.[2]).not.toBe(calls[0]?.[2]);
    expect(calls[6]?.[2]).not.toBe(calls[4]?.[2]);
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
    const create = jest
      .spyOn(api.getAdapter(), 'createTransaction')
      .mockRejectedValueOnce(new TypeError('Ambiguous failure.'))
      .mockResolvedValue({ data: result });

    await SecureStorage.setItem('session_user', JSON.stringify({ id: 'user-a' }));
    await expect(api.createTransaction(request)).rejects.toMatchObject({
      error: { code: 'NETWORK_ERROR' },
    });
    await SecureStorage.setItem('session_user', JSON.stringify({ id: 'user-b' }));
    await expect(api.createTransaction(request)).resolves.toBe(result);
    await SecureStorage.setItem('session_user', JSON.stringify({ id: 'user-a' }));
    await expect(api.createTransaction(request)).resolves.toBe(result);

    const calls = create.mock.calls as unknown as [string, CreateTransactionRequest, string][];
    expect(calls[0]?.[2]).not.toBe(calls[1]?.[2]);
    expect(calls[0]?.[2]).toBe(calls[2]?.[2]);
  });
});
