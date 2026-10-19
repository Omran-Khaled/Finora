// Login flow: form semantics (labels, password masking), success path, and
// visible error feedback on failure.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';
import { toast } from 'sonner';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  login: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ login: mocks.login, user: null, loading: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('Login flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders accessible labelled inputs and password masking', () => {
    render(<LoginPage />);
    const email = screen.getByLabelText('Email address');
    const password = screen.getByLabelText('Password');
    expect(email).toHaveAttribute('type', 'email');
    expect(password).toHaveAttribute('type', 'password');
  });

  it('logs in and navigates to the dashboard on success', async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue(undefined);
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email address'), 'test@finora.app');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith('test@finora.app', 'secret123');
      expect(mocks.push).toHaveBeenCalledWith('/dashboard');
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows visible feedback and stays on the page on failure', async () => {
    const user = userEvent.setup();
    mocks.login.mockRejectedValue({ error: { code: 'UNAUTHORIZED', message: 'Bad credentials', requestId: 'r1' } });
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email address'), 'test@finora.app');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Email or password is incorrect. Check your details and try again.'
      );
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
