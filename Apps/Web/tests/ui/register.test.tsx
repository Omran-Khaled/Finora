import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '@/app/register/page';
import { toast } from 'sonner';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  register: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ register: mocks.register, user: null, loading: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('Register flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows choosing a base currency and sends it during registration', async () => {
    const user = userEvent.setup();
    mocks.register.mockResolvedValue(undefined);
    render(<RegisterPage />);

    await user.type(screen.getByLabelText('Email address'), 'test@finora.app');
    await user.type(screen.getByLabelText('Password'), 'SecurePass123');
    await user.type(screen.getByLabelText('Confirm password'), 'SecurePass123');

    const currencySelect = screen.getByLabelText('Base currency');
    await user.selectOptions(currencySelect, 'SAR');

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledWith('test@finora.app', 'SecurePass123', 'SAR');
    });
    expect(mocks.push).toHaveBeenCalledWith('/onboarding');
  });

  it('gives a useful next step when the email is already registered', async () => {
    const user = userEvent.setup();
    mocks.register.mockRejectedValue({
      error: { code: 'DUPLICATE_REQUEST', message: 'Duplicate email' },
    });
    render(<RegisterPage />);

    await user.type(screen.getByLabelText('Email address'), 'test@finora.app');
    await user.type(screen.getByLabelText('Password'), 'SecurePass123');
    await user.type(screen.getByLabelText('Confirm password'), 'SecurePass123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'An account may already exist for this email. Sign in or use a different email.',
      );
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
