/**
 * F-010 — mock ↔ real API parity for the canonical resource shapes (mobile).
 *
 * `@finora/contracts` owns the field manifests the live API exposes. The mobile
 * mock adapter backs mock mode, so every resource it returns must expose those
 * same fields — otherwise a Mobile screen can pass in mock mode and break
 * against the real API (and vice versa).
 *
 * Mirrors `Apps/Web/tests/lib/mock-contract-shapes.test.ts`; the API side of the
 * same contract is asserted by `Apps/api/test/contract-shapes-drift.spec.ts`.
 */
import { describe, expect, it } from '@jest/globals';
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
import { mockAdapter } from '../lib/api/mockAdapter';

const DEMO_EMAIL = 'demo@finora.app';
const DEMO_PASSWORD = 'password123';

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

describe('mobile mock adapter — canonical contract shapes', () => {
  it('exposes every canonical API field on every mocked resource', async () => {
    const session = await mockAdapter.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const userId = session.data.user.id;

    const accounts = (await mockAdapter.getAccounts(userId)).data;
    expect(accounts.length).toBeGreaterThan(0);
    accounts.forEach((account) => expectCanonicalFields('accounts[]', account, ACCOUNT_API_FIELDS));

    const categories = (await mockAdapter.getCategories(userId)).data;
    expect(categories.length).toBeGreaterThan(0);
    categories.forEach((category) => expectCanonicalFields('categories[]', category, CATEGORY_API_FIELDS));

    const transactions = (await mockAdapter.getTransactions(userId)).data;
    expect(transactions.length).toBeGreaterThan(0);
    transactions.forEach((transaction) => {
      expectCanonicalFields('transactions[]', transaction, TRANSACTION_API_FIELDS);
      if (transaction.type === 'TRANSFER') {
        expect(['SOURCE', 'DESTINATION']).toContain(transaction.transferDirection);
      }
    });

    const budgets = (await mockAdapter.getBudgets(userId)).data;
    expect(budgets.length).toBeGreaterThan(0);
    budgets.forEach((budget) => expectCanonicalFields('budgets[]', budget, BUDGET_API_FIELDS));

    const goals = (await mockAdapter.getSavingsGoals(userId)).data;
    expect(goals.length).toBeGreaterThan(0);
    goals.forEach((goal) => expectCanonicalFields('savingsGoals[]', goal, SAVINGS_GOAL_API_FIELDS));

    const summary = (await mockAdapter.getDashboardSummary(userId)).data;
    expectCanonicalFields('GET /dashboard/summary', summary, DASHBOARD_SUMMARY_API_FIELDS);
    expect(summary.budgets.length).toBeGreaterThan(0);
    summary.budgets.forEach((budget) =>
      expectCanonicalFields('dashboard budgets[]', budget, DASHBOARD_BUDGET_API_FIELDS)
    );
    expect(summary.goals.length).toBeGreaterThan(0);
    summary.goals.forEach((goal) => expectCanonicalFields('dashboard goals[]', goal, DASHBOARD_GOAL_API_FIELDS));
  });

  it('exposes the canonical Transfer envelope and both legs', async () => {
    const session = await mockAdapter.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const userId = session.data.user.id;
    const accounts = (await mockAdapter.getAccounts(userId)).data;
    const bank = accounts.find((account) => account.type === 'BANK');
    const savings = accounts.find((account) => account.type === 'SAVINGS');
    expect(bank).toBeDefined();
    expect(savings).toBeDefined();

    const created = (
      await mockAdapter.createTransfer(
        userId,
        {
          fromAccountId: bank!.id,
          toAccountId: savings!.id,
          amountMinor: '2500',
          transactionDate: '2026-08-16',
        },
        'mobile-contract-shapes-transfer'
      )
    ).data;

    expect(Object.keys(created).sort()).toEqual(['destinationTx', 'sourceTx', 'transfer']);
    expectCanonicalFields('transfer', created.transfer, TRANSFER_API_FIELDS);
    expectCanonicalFields('sourceTx', created.sourceTx, TRANSACTION_API_FIELDS);
    expectCanonicalFields('destinationTx', created.destinationTx, TRANSACTION_API_FIELDS);
    expect(created.sourceTx.transferDirection).toBe('SOURCE');
    expect(created.destinationTx.transferDirection).toBe('DESTINATION');
  });

  it('renames accounts and archives them without deleting financial history', async () => {
    const session = await mockAdapter.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const userId = session.data.user.id;
    const created = await mockAdapter.createAccount(userId, {
      name: 'Temporary account',
      type: 'BANK',
      currencyCode: session.data.user.baseCurrency,
      openingBalanceMinor: '0',
    });

    const updated = await mockAdapter.updateAccount(userId, created.data.id, { name: 'Renamed account' });
    expect(updated.data.name).toBe('Renamed account');

    const archived = await mockAdapter.archiveAccount(userId, created.data.id);
    expect(archived.data.status).toBe('ARCHIVED');
    expect((await mockAdapter.getAccounts(userId)).data).toContainEqual(archived.data);
  });
});
