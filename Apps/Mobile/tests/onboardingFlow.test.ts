/**
 * Integration test: reproduces the EXACT app flow of the onboarding screen
 * (AuthProvider bootstrap → register → createAccount → getAccounts) through
 * the ApiClient facade, including SecureStorage session persistence.
 */
import { describe, it, expect } from '@jest/globals';
import { api } from '../lib/api/apiClient';
import { mockAdapter } from '../lib/api/mockAdapter';
import type { User } from '../types/contract';

let seq = 0;
async function registerUser(baseCurrency: string): Promise<User> {
  seq++;
  const session = await api.register({
    email: `cur-${Date.now()}-${seq}@finora.test`,
    password: 'secret-pass-1',
    baseCurrency,
  });
  return session.user;
}

describe('Onboarding flow via ApiClient (app-identical path)', () => {
  it('register → create first account → accounts list, with a chosen non-USD currency', async () => {
    const email = `flow-${Date.now()}@finora.test`;

    // 1. Register (register.tsx path)
    const session = await api.register({ email, password: 'secret-pass-1', baseCurrency: 'SAR' });
    expect(session.user.baseCurrency).toBe('SAR');

    // 2. Session must be restorable (AuthProvider bootstrap path)
    const restored = await api.getCurrentUser();
    expect(restored?.email).toBe(email);
    expect(restored?.baseCurrency).toBe('SAR');

    // 3. Create the first account (onboarding "Complete Setup & Enter Finora")
    const account = await api.createAccount({
      name: 'Main Checking Account',
      type: 'BANK',
      currencyCode: 'SAR',
      openingBalanceMinor: '100000',
    });
    expect(account.currencyCode).toBe('SAR');
    expect(account.balanceMinor).toBe('100000');

    // 4. refreshOnboardingFlag path — accounts list must now be non-empty
    const accounts = await api.getAccounts();
    expect(accounts.length).toBe(1);
  });

  it('register defaults to USD when no currency is provided (legacy path)', async () => {
    const session = await api.register({
      email: `legacy-${Date.now()}@finora.test`,
      password: 'secret-pass-1',
    });
    expect(session.user.baseCurrency).toBe('USD');
  });

  it('STALE SESSION recovery: a session restored after an app reload (mock memory wiped) can still complete onboarding', async () => {
    // Simulates: user registered in a previous app run → app reloaded →
    // SecureStore still holds session_user, but the in-memory mock lost its users.
    const staleUserId = 'usr_ghost_from_previous_run';

    // The restored session makes needsOnboarding=true (no accounts for this id)
    const accountsBefore = await mockAdapter.getAccounts(staleUserId);
    expect(accountsBefore.data.length).toBe(0);

    // Pressing "Complete Setup & Enter Finora" — must NOT throw UNAUTHORIZED
    const account = await mockAdapter.createAccount(staleUserId, {
      name: 'Main Checking Account',
      type: 'BANK',
      currencyCode: 'SAR',
      openingBalanceMinor: '250000',
    });

    expect(account.data.userId).toBe(staleUserId);
    expect(account.data.currencyCode).toBe('SAR');

    // refreshOnboardingFlag must now see the account → onboarding completes
    const accountsAfter = await mockAdapter.getAccounts(staleUserId);
    expect(accountsAfter.data.length).toBe(1);
  });

  it('currency divergence is still rejected for KNOWN users (authority rule intact)', async () => {
    const user = await registerUser('USD');
    await expect(
      mockAdapter.createAccount(user.id, {
        name: 'Wrong Currency',
        type: 'CASH',
        currencyCode: 'EUR',
        openingBalanceMinor: '100',
      })
    ).rejects.toMatchObject({ error: { code: 'INVALID_CURRENCY' } });
  });
});
