import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomNav } from '@/components/layout/bottom-nav';

const mocks = vi.hoisted(() => ({
  pathname: '/dashboard',
  setTheme: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: mocks.setTheme }),
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'finora@example.com', baseCurrency: 'EUR' },
  }),
}));

describe('authenticated navigation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.pathname = '/dashboard';
    vi.clearAllMocks();
  });

  it('marks nested routes active without treating them as the dashboard', () => {
    mocks.pathname = '/transactions/new';
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(screen.getByRole('link', { name: 'Categories' })).toBeInTheDocument();
  });

  it('expands and collapses accessibly and persists the preference', async () => {
    const user = userEvent.setup();
    const firstRender = render(<Sidebar />);

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'title',
      'Transactions'
    );
    expect(screen.queryByText('Finora — Understand your money')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('finora:sidebar-collapsed')).toBe('true');

    firstRender.unmount();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'title',
      'Settings'
    );
  });

  it('shows the contextual create route and authenticated currency profile', () => {
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: 'New transaction' })).toHaveAttribute(
      'href',
      '/transactions/new'
    );
    expect(screen.getByRole('link', { name: 'Add an account' })).toHaveAttribute(
      'href',
      '/accounts/new'
    );
    expect(screen.getByText('EUR · Finora')).toBeInTheDocument();
    expect(screen.getByText('finora@example.com')).toBeInTheDocument();
  });

  it('remains operable when browser storage is unavailable', async () => {
    const user = userEvent.setup();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    try {
      render(<Sidebar />);
      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
      expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('keeps mobile navigation active for nested transaction pages and More routes', () => {
    mocks.pathname = '/transactions/tx-123';
    const { rerender } = render(<BottomNav />);

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(screen.getByRole('link', { name: 'Add transaction' })).toHaveAttribute(
      'href',
      '/transactions/new'
    );

    mocks.pathname = '/accounts/account-123';
    rerender(<BottomNav />);
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current'
    );
  });
});
