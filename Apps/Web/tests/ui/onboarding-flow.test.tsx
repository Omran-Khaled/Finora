import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from '@/app/onboarding/page';
import { AppShell } from '@/components/layout/app-shell';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  pathname: '/dashboard',
  auth: {
    user: { baseCurrency: 'USD' },
    loading: false,
    hasCompletedOnboarding: false,
    setOnboardingComplete: vi.fn(),
    updateBaseCurrency: vi.fn(),
  },
  createAccount: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  usePathname: () => mocks.pathname,
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/components/layout/sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/layout/bottom-nav', () => ({ BottomNav: () => null }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/api-client', () => ({
  api: { accounts: { create: mocks.createAccount } },
}));

describe('optional onboarding flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/dashboard';
    mocks.auth.user.baseCurrency = 'USD';
    mocks.auth.hasCompletedOnboarding = false;
    mocks.auth.setOnboardingComplete.mockImplementation(() => {
      mocks.auth.hasCompletedOnboarding = true;
    });
    mocks.auth.updateBaseCurrency.mockResolvedValue(undefined);
    mocks.createAccount.mockResolvedValue(undefined);
  });

  it('lets a newly signed-in user open the dashboard when setup is incomplete', () => {
    render(
      <AppShell>
        <p>Dashboard is ready</p>
      </AppShell>,
    );

    expect(screen.getByText('Dashboard is ready')).toBeInTheDocument();
    expect(mocks.router.replace).not.toHaveBeenCalledWith('/onboarding');
  });

  it('marks setup complete when skipped and stays on the dashboard', async () => {
    const user = userEvent.setup();
    const view = render(
      <>
        <OnboardingPage />
        <AppShell>
          <p>Dashboard is ready</p>
        </AppShell>
      </>,
    );

    expect(screen.getByText('Dashboard is ready')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    view.rerender(
      <>
        <OnboardingPage />
        <AppShell>
          <p>Dashboard is ready</p>
        </AppShell>
      </>,
    );

    await waitFor(() => {
      expect(mocks.auth.setOnboardingComplete).toHaveBeenCalledOnce();
      expect(mocks.auth.hasCompletedOnboarding).toBe(true);
      expect(mocks.router.replace).toHaveBeenCalledWith('/dashboard');
    });
    expect(screen.getByText('Dashboard is ready')).toBeInTheDocument();
    expect(mocks.router.replace).not.toHaveBeenCalledWith('/onboarding');
    expect(mocks.toast.success).toHaveBeenCalledWith(
      'You can add your first account anytime from your dashboard.',
    );
  });

  it('creates an optional first account using the selected base currency', async () => {
    const user = userEvent.setup();
    mocks.auth.user.baseCurrency = 'SAR';
    render(<OnboardingPage />);

    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.type(screen.getByLabelText('Account name'), 'Everyday bank');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mocks.auth.updateBaseCurrency).toHaveBeenCalledWith('SAR');
      expect(mocks.createAccount).toHaveBeenCalledWith({
        name: 'Everyday bank',
        type: 'BANK',
        currencyCode: 'SAR',
        openingBalanceMinor: '0',
      });
      expect(mocks.auth.setOnboardingComplete).toHaveBeenCalledOnce();
    });
  });
});
