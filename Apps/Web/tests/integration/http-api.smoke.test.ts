import { beforeAll, describe, expect, it } from 'vitest';
import { httpApi } from '@/lib/http-adapter';

const smokeEnabled = process.env.FINORA_HTTP_SMOKE === '1';

describe.skipIf(!smokeEnabled)('real API HTTP smoke', () => {
  beforeAll(() => {
    const values = new Map<string, string>();

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
  });

  it('registers a user and creates/lists an account through the real adapter', async () => {
    const email = `ws-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const registration = await httpApi.auth.register({
      email,
      password: `ci-smoke-${crypto.randomUUID()}`,
      baseCurrency: 'USD',
    });

    expect(registration.data.email).toBe(email);
    expect(registration.token).toBeTruthy();

    const createdAccount = await httpApi.accounts.create({
      name: 'CI HTTP smoke account',
      type: 'BANK',
      currencyCode: 'USD',
      openingBalanceMinor: '0',
    });
    const accounts = await httpApi.accounts.list();

    expect(accounts.some((account) => account.id === createdAccount.id)).toBe(true);

    const createdIncome = await httpApi.transactions.create(
      {
        type: 'INCOME',
        accountId: createdAccount.id,
        amountMinor: '500',
        transactionDate: '2026-10-10',
      },
      `ci-smoke-${crypto.randomUUID()}`,
    );
    const transactions = await httpApi.transactions.list({ accountId: createdAccount.id });

    expect(transactions.data.some((transaction) => transaction.id === createdIncome.id)).toBe(true);
  });
});
