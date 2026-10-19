// Financial contract coherence tests for the mock adapter (part 1):
// single-currency accounts, base-currency lock, and the balance effects of
// income/expense/transfer/void.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockApi } from '@/lib/mock-adapter';
import { mockAuth } from '@/lib/mock-server';

describe('mock adapter — legacy fixture repair', () => {
  beforeEach(() => {
    mockAuth.reset();
  });

  it('coerces numeric minors persisted by legacy fixtures to canonical strings', async () => {
    await mockApi.auth.register({ email: 'legacy@finora.app', password: 'secret123' });
    const raw = window.localStorage.getItem('finora-mock-state-v1');
    expect(raw).toBeTruthy();
    const state = JSON.parse(raw as string) as {
      accounts: Array<Record<string, unknown>>;
      transactions: Array<Record<string, unknown>>;
    };
    // Simulate a legacy fixture that persisted numbers instead of strings.
    state.accounts.push({
      id: 'legacy-numeric',
      userId: 'legacy-user',
      name: 'Legacy',
      type: 'BANK',
      currencyCode: 'USD',
      openingBalanceMinor: 100000,
      balanceMinor: 100000,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    window.localStorage.setItem('finora-mock-state-v1', JSON.stringify(state));
    // Reload the module so restoreState() re-runs against the legacy payload.
    vi.resetModules();
    const fresh = await import('@/lib/mock-adapter');
    const accounts = await fresh.mockApi.accounts.list();
    const legacy = accounts.find((a) => a.id === 'legacy-numeric');
    expect(legacy?.balanceMinor).toBe('100000');
    expect(legacy?.openingBalanceMinor).toBe('100000');
  });
});

async function setupUser() {
  const { data } = await mockApi.auth.register({
    email: 'test@finora.app',
    password: 'secret123',
  });
  return data;
}

describe('mock adapter — auth & single-currency MVP', () => {
  beforeEach(() => {
    mockAuth.reset();
  });

  it('registers a user and seeds system categories', async () => {
    const user = await setupUser();
    expect(user.baseCurrency).toBe('USD');
    const categories = await mockApi.categories.list();
    expect(categories.length).toBeGreaterThan(0);
    // Category types are INCOME | EXPENSE only — never TRANSFER
    for (const c of categories) {
      expect(['INCOME', 'EXPENSE']).toContain(c.type);
    }
  });

  it('rejects creating an account in a non-base currency', async () => {
    await setupUser();
    await expect(
      mockApi.accounts.create({
        name: 'Euro wallet',
        type: 'CASH',
        currencyCode: 'EUR',
        openingBalanceMinor: '0',
      })
    ).rejects.toMatchObject({ error: { code: 'INVALID_CURRENCY' } });
  });

  it('locks the base currency once accounts exist', async () => {
    const user = await setupUser();
    await mockApi.accounts.create({
      name: 'Main bank',
      type: 'BANK',
      currencyCode: 'USD',
      openingBalanceMinor: '10000',
    });
    await expect(
      mockApi.auth.updateProfile({ baseCurrency: 'EUR' })
    ).rejects.toMatchObject({ error: { code: 'BASE_CURRENCY_LOCKED' } });
    // Currency is unchanged
    const me = await mockApi.auth.me();
    expect(me?.baseCurrency).toBe(user.baseCurrency);
  });

  it('allows changing the base currency while no accounts exist', async () => {
    await setupUser();
    const updated = await mockApi.auth.updateProfile({ baseCurrency: 'EUR' });
    expect(updated.baseCurrency).toBe('EUR');
  });
});

describe('mock adapter — income, expense, transfer, void', () => {
  let accountId: string;
  let savingsId: string;

  beforeEach(async () => {
    mockAuth.reset();
    await setupUser();
    const bank = await mockApi.accounts.create({
      name: 'Main bank',
      type: 'BANK',
      currencyCode: 'USD',
      openingBalanceMinor: '100000',
    });
    const savings = await mockApi.accounts.create({
      name: 'Savings',
      type: 'SAVINGS',
      currencyCode: 'USD',
      openingBalanceMinor: '0',
    });
    accountId = bank.id;
    savingsId = savings.id;
  });

  it('income increases and expense decreases the account balance', async () => {
    await mockApi.transactions.create({
      type: 'INCOME',
      accountId,
      amountMinor: '50000',
      transactionDate: '2026-08-01',
    }, 'web-income-1');
    let accounts = await mockApi.accounts.list();
    expect(accounts.find((a) => a.id === accountId)?.balanceMinor).toBe('150000');

    const category = (await mockApi.categories.list()).find(
      (c) => c.type === 'EXPENSE'
    )!;
    await mockApi.transactions.create({
      type: 'EXPENSE',
      accountId,
      categoryId: category.id,
      amountMinor: '20000',
      transactionDate: '2026-08-02',
    }, 'web-expense-1');
    accounts = await mockApi.accounts.list();
    expect(accounts.find((a) => a.id === accountId)?.balanceMinor).toBe('130000');
  });

  it('rejects expenses without a category', async () => {
    await expect(
      mockApi.transactions.create({
        type: 'EXPENSE',
        accountId,
        amountMinor: '100',
        transactionDate: '2026-08-02',
      }, 'web-missing-category')
    ).rejects.toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('transfer moves value between accounts and is neither income nor expense', async () => {
    const transfer = await mockApi.transfers.create({
      fromAccountId: accountId,
      toAccountId: savingsId,
      amountMinor: '25000',
      transactionDate: '2026-08-03',
    }, 'web-transfer-1');

    const accounts = await mockApi.accounts.list();
    expect(accounts.find((a) => a.id === accountId)?.balanceMinor).toBe('75000');
    expect(accounts.find((a) => a.id === savingsId)?.balanceMinor).toBe('25000');

    expect(transfer.transfer.sourceTransactionId).toBe(transfer.sourceTx.id);
    expect(transfer.transfer.destinationTransactionId).toBe(transfer.destinationTx.id);
    expect(transfer.sourceTx.type).toBe('TRANSFER');
    expect(transfer.sourceTx.categoryId).toBeNull();
    expect(transfer.destinationTx.type).toBe('TRANSFER');

    const summary = await mockApi.dashboard.getSummary();
    expect(summary.income.minor).toBe('0');
    expect(summary.expenses.minor).toBe('0');
  });

  it('uses one stable creation timestamp for a transfer and both legs', async () => {
    const created = await mockApi.transfers.create({
      fromAccountId: accountId,
      toAccountId: savingsId,
      amountMinor: '25000',
      transactionDate: '2026-08-03',
    }, 'web-transfer-timestamp');
    const sourceRead = await mockApi.transactions.get(created.sourceTx.id);
    const destinationRead = await mockApi.transactions.get(created.destinationTx.id);
    const transferRead = await mockApi.transfers.get(created.transfer.id);
    const secondTransferRead = await mockApi.transfers.get(created.transfer.id);

    expect(created.transfer.createdAt).toBe(created.sourceTx.createdAt);
    expect(created.transfer.createdAt).toBe(created.destinationTx.createdAt);
    expect(created.sourceTx.createdAt).toBe(created.sourceTx.updatedAt);
    expect(created.destinationTx.createdAt).toBe(created.destinationTx.updatedAt);
    expect(sourceRead?.createdAt).toBe(created.transfer.createdAt);
    expect(destinationRead?.createdAt).toBe(created.transfer.createdAt);
    expect(transferRead).toEqual(secondTransferRead);
  });

  it('rejects transfers exceeding the source balance', async () => {
    await expect(
      mockApi.transfers.create({
        fromAccountId: accountId,
        toAccountId: savingsId,
        amountMinor: '99999999',
        transactionDate: '2026-08-03',
      }, 'web-transfer-insufficient')
    ).rejects.toMatchObject({ error: { code: 'INSUFFICIENT_FUNDS' } });
  });

  it('void keeps the record but reverses its financial effect', async () => {
    const category = (await mockApi.categories.list()).find(
      (c) => c.type === 'EXPENSE'
    )!;
    const tx = await mockApi.transactions.create({
      type: 'EXPENSE',
      accountId,
      categoryId: category.id,
      amountMinor: '30000',
      transactionDate: '2026-08-04',
    }, 'web-void-1');

    const voided = await mockApi.transactions.void(tx.id);
    expect(voided.status).toBe('VOIDED');
    await expect(mockApi.transactions.get(tx.id)).resolves.toBeDefined();

    const accounts = await mockApi.accounts.list();
    expect(accounts.find((a) => a.id === accountId)?.balanceMinor).toBe('100000');

    await expect(mockApi.transactions.void(tx.id)).rejects.toMatchObject({
      error: { code: 'TRANSACTION_ALREADY_VOIDED' },
    });
  });
});
