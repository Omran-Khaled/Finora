/**
 * UI integration test: renders the REAL OnboardingScreen inside the REAL
 * AuthProvider, presses "Complete Setup & Enter Finora" and asserts the
 * onboarding completes (needsOnboarding flips to false + account exists).
 */
/// <reference types="jest" />

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import OnboardingScreen from '../app/(onboarding)/index';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { ThemeProvider } from '../providers/ThemeProvider';
import { api } from '../lib/api/apiClient';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

function OnboardingProbe() {
  const { needsOnboarding, user } = useAuth();
  return (
    <Text testID="probe">
      {`needsOnboarding=${needsOnboarding};user=${user ? user.email : 'none'}`}
    </Text>
  );
}

describe('Onboarding screen — Complete Setup button (real render)', () => {
  it('creates the first account and completes onboarding when pressed', async () => {
    const email = `ui-${Date.now()}@finora.test`;
    await api.register({ email, password: 'secret-pass-1', baseCurrency: 'SAR' });

    const screen = render(
      <ThemeProvider>
        <AuthProvider>
          <OnboardingScreen />
          <OnboardingProbe />
        </AuthProvider>
      </ThemeProvider>,
    );

    // Bootstrap restores the session user
    await waitFor(() => {
      expect(screen.getByTestId('probe').props.children).toContain('user=' + email);
    });

    // Step 1 → Continue → Step 2
    fireEvent.press(screen.getByText('Continue'));

    // Press the exact button the user reports as "doing nothing"
    fireEvent.press(screen.getByText('Complete Setup & Enter Finora'));

    await waitFor(
      () => {
        expect(screen.getByTestId('probe').props.children).toContain('needsOnboarding=false');
      },
      { timeout: 5000 },
    );

    const accounts = await api.getAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0]!.currencyCode).toBe('SAR');
  }, 30000);
});
