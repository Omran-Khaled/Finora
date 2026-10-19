// F-010 — mock ↔ real API parity for the canonical resource shapes.
//
// `@finora/contracts` owns the field manifests the live API exposes. The mock
// adapter backs mock mode in the Web app, so every resource it returns must
// expose those same fields — otherwise UI code can pass in mock mode and break
// against the real API (and vice versa).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACCOUNT_API_FIELDS,
  BUDGET_API_FIELDS,
  CATEGORY_API_FIELDS,
  DASHBOARD_BUDGET_API_FIELDS,
  DASHBOARD_GOAL_API_FIELDS,
  DASHBOARD_SUMMARY_API_FIELDS,
  SAVINGS_GOAL_API_FIELDS,
  TRANSACTION_API_FIELDS,
  TRANSFER_API_FIELDS,
} from '@finora/contracts';
import { mockApi } from '@/lib/mock-adapter';
import { mockAuth, seedDemoData } from '@/lib/mock-server';

/** Every canonical field is present; `optionalAbsent` lists aliases the API itself omits. */
function expectCanonicalFields(
  label: string,
  payload: object,
  manifest: readonly string[],
  optionalAbsent: readonly string[] = []
): void {
  const missing = manifest.filter((field) => !(field in payload) && !optionalAbsent.includes(field));
  expect({ label, missing }).toEqual({ label, missing: [] });
}

describe('mock adapter — canonical contract shapes', () => {
  beforeEach(() => {
    mockAuth.reset();
  });

  it('exposes every canonical API field on every mock resource', async () => {
    await mockApi.auth.register({ email: 'shapes@finora.app', password: 'secret123' });
    seedDemoData();

    const accounts = await mockApi.accounts.list();
    expect(accounts.length).toBeGreaterThan(0);
    accounts.forEach((account) => expectCanonicalFields('accounts[]', account, ACCOUNT_API_FIELDS));

    const categories = await mockApi.categories.list();
    expect(categories.length).toBeGreaterThan(0);
    categories.forEach((category) => expectCanonicalFields('categories[]', category, CATEGORY_API_FIELDS));

    const transactions = (await mockApi.transactions.list()).data;
    expect(transactions.length).toBeGreaterThan(0);
    transactions.forEach((transaction) => {
      expectCanonicalFields('transactions[]', transaction, TRANSACTION_API_FIELDS, ['transferDirection']);
      if (transaction.type === 'TRANSFER') {
        expect(['SOURCE', 'DESTINATION']).toContain(transaction.transferDirection);
      }
    });

    const budgets = await mockApi.budgets.list();
    expect(budgets.length).toBeGreaterThan(0);
    budgets.forEach((budget) => expectCanonicalFields('budgets[]', budget, BUDGET_API_FIELDS));

    const goals = await mockApi.savingsGoals.list();
    expect(goals.length).toBeGreaterThan(0);
    goals.forEach((goal) => expectCanonicalFields('savingsGoals[]', goal, SAVINGS_GOAL_API_FIELDS));

    const summary = await mockApi.dashboard.getSummary();
    expectCanonicalFields('GET /dashboard/summary', summary, DASHBOARD_SUMMARY_API_FIELDS);
    expect(summary.budgets.length).toBeGreaterThan(0);
    summary.budgets.forEach((budget) =>
      expectCanonicalFields('dashboard budgets[]', budget, DASHBOARD_BUDGET_API_FIELDS)
    );
    expect(summary.goals.length).toBeGreaterThan(0);
    summary.goals.forEach((goal) => expectCanonicalFields('dashboard goals[]', goal, DASHBOARD_GOAL_API_FIELDS));
  });

  it('exposes the canonical Transfer envelope and both legs', async () => {
    await mockApi.auth.register({ email: 'shapes@finora.app', password: 'secret123' });
    const bank = await mockApi.accounts.create({
      name: 'Bank',
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

    const created = await mockApi.transfers.create(
      {
        fromAccountId: bank.id,
        toAccountId: savings.id,
        amountMinor: '2500',
        transactionDate: '2026-08-16',
      },
      'web-contract-shapes-transfer'
    );

    expectCanonicalFields('transfer', created.transfer, TRANSFER_API_FIELDS);
    expectCanonicalFields('sourceTx', created.sourceTx, TRANSACTION_API_FIELDS);
    expectCanonicalFields('destinationTx', created.destinationTx, TRANSACTION_API_FIELDS);
    expect(created.sourceTx.transferDirection).toBe('SOURCE');
    expect(created.destinationTx.transferDirection).toBe('DESTINATION');
  });
});
