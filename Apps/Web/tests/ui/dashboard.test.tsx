// Dashboard contract alignment: renders the GET /dashboard/summary payload —
// it presents and formats the API's numbers, it does not compute its own.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '@/app/(app)/dashboard/page';
import type { DashboardSummary } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      email: 'test@finora.app',
      baseCurrency: 'USD',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
    loading: false,
  }),
}));

const summaryMock = vi.hoisted(() => vi.fn());
const txListMock = vi.hoisted(() => vi.fn());
const accountsListMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  api: {
    dashboard: { getSummary: summaryMock },
    transactions: { list: txListMock },
    accounts: { list: accountsListMock },
  },
}));

const summary: DashboardSummary = {
  period: { year: 2026, month: 8 },
  balances: { totalMinor: '100000' },
  income: { minor: '240000' },
  expenses: { minor: '11500' },
  savings: { minor: '228500' },
  budgets: [
    {
      categoryId: 'sys-food',
      categoryName: 'Food',
      limitMinor: '30000',
      spentMinor: '1500',
      remainingMinor: '28500',
      progressPercent: 5,
      exceeded: false,
      percentage: 5,
      isExceeded: false,
    },
  ],
  goals: [
    {
      id: 'goal-1',
      name: 'Emergency Fund',
      accountId: 'acc-savings',
      accountName: 'Savings',
      targetAmountMinor: '300000',
      currentAmountMinor: '100000',
      progressPercent: 33,
      progressPercentage: 33,
      targetDate: null,
      status: 'ACTIVE',
    },
  ],
};

describe('Dashboard rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    summaryMock.mockResolvedValue(summary);
    txListMock.mockResolvedValue({ data: [], meta: { nextCursor: null } });
    accountsListMock.mockResolvedValue([
      {
        id: 'acc-1',
        userId: 'u1',
        name: 'Main bank',
        type: 'BANK',
        currencyCode: 'USD',
        openingBalanceMinor: '0',
        balanceMinor: '100000',
        status: 'ACTIVE',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
      },
    ]);
  });

  it('renders the summary contract values as formatted money', async () => {
    render(<DashboardPage />);

    // The same canonical value is legitimately rendered by more than one widget
    // (the hero total repeats in the accounts list; income/expenses repeat in the
    // cash-flow visual), so assert on the rendered value, not on a single node.
    await waitFor(() => {
      expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('$2,400.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$115.00').length).toBeGreaterThan(0);
  });

  it('renders an account with a missing type and labels it as unknown', async () => {
    accountsListMock.mockResolvedValue([
      {
        id: 'legacy-1',
        userId: 'u1',
        name: 'Legacy bank',
        currencyCode: 'USD',
        openingBalanceMinor: '0',
        balanceMinor: '100000',
        status: 'ACTIVE',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
      },
    ]);
    render(<DashboardPage />);

    const accountCard = await screen.findByRole('link', {
      name: /Legacy bank/,
    });
    expect(accountCard).toHaveAttribute('href', '/accounts/legacy-1');
    expect(accountCard).toHaveTextContent('Unknown type');
    expect(accountCard).toHaveTextContent('$1,000.00');
  });

  it('renders budgets and goals from the summary payload', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument();
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    });
  });

  it('keeps recent transactions as semantic links', async () => {
    txListMock.mockResolvedValue({
      data: [
        {
          id: 'tx-9',
          userId: 'u1',
          accountId: 'acc-1',
          categoryId: null,
          type: 'TRANSFER',
          amountMinor: '1000',
          currencyCode: 'USD',
          description: null,
          transactionDate: '2026-08-21',
          status: 'ACTIVE',
          createdAt: '2026-08-21T00:00:00Z',
          updatedAt: '2026-08-21T00:00:00Z',
        },
      ],
      meta: { nextCursor: null },
    });
    render(<DashboardPage />);

    const link = await screen.findByRole('link', { name: /transfer/i });
    expect(link).toHaveAttribute('href', '/transactions/tx-9');
  });

  it('shows the unauthorized API error with login guidance and retry', async () => {
    summaryMock.mockRejectedValue({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Your session is no longer valid.',
        requestId: 'req_auth_1',
      },
    });
    render(<DashboardPage />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(
        'Your session is no longer valid. Your session may have expired. Sign in again to continue.',
      );
      expect(
        screen.getByRole('button', { name: /try again/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByText('Reference: req_auth_1')).toBeInTheDocument();
  });

  it('shows standardized server error details and request ID', async () => {
    summaryMock.mockRejectedValue({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Please try again later.',
        requestId: 'req_server_42',
        stack: 'private stack trace',
      },
      token: 'private-token',
      rawResponse: 'raw response body',
    });
    render(<DashboardPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Request failed (INTERNAL_ERROR)',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please try again later.',
    );
    expect(screen.getByText('Reference: req_server_42')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to login' })).toBeNull();
    expect(
      screen.queryByText(/private stack trace|private-token|raw response body/),
    ).toBeNull();
  });

  it('shows friendly reachability guidance for network failures', async () => {
    summaryMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<DashboardPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "We couldn't reach the Finora service. Check your internet connection and try again.",
    );
    expect(alert).toHaveTextContent('Dashboard request: summary.');
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('shows safe reachability guidance for a NETWORK_ERROR envelope', async () => {
    summaryMock.mockRejectedValue({
      error: {
        code: 'NETWORK_ERROR',
        message: 'private network response details',
        requestId: 'req_net',
      },
    });
    render(<DashboardPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "We couldn't reach the Finora service. Check your internet connection and try again.",
    );
    expect(
      screen.getByRole('heading', { name: 'Request failed (NETWORK_ERROR)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reference: req_net')).toBeInTheDocument();
    expect(alert).toHaveTextContent('Dashboard request: summary.');
    expect(screen.queryByText(/private network response details/)).toBeNull();
  });

  it('shows safe service-timeout guidance and keeps retry available', async () => {
    summaryMock.mockRejectedValueOnce(new Error('Request timed out'));
    render(<DashboardPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The Finora service took too long to respond. Please try again.',
    );
    expect(alert).toHaveTextContent('Dashboard request: summary.');
    expect(screen.queryByText('Request timed out')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => {
      expect(screen.getAllByText('$2,400.00').length).toBeGreaterThan(0);
    });
    expect(summaryMock).toHaveBeenCalledTimes(2);
  });

  it('identifies an invalid response field without rendering its value', async () => {
    summaryMock
      .mockResolvedValueOnce({
        ...summary,
        savings: { minor: 'private-invalid-amount' },
      } as unknown as DashboardSummary)
      .mockResolvedValueOnce(summary);
    render(<DashboardPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The dashboard response contains invalid data.',
    );
    expect(alert).toHaveTextContent(
      'Invalid response field: summary.savings.minor.',
    );
    expect(screen.queryByText(/private-invalid-amount/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getAllByText('$2,400.00').length).toBeGreaterThan(0);
    });
    expect(summaryMock).toHaveBeenCalledTimes(2);
  });

  it('identifies the failed dashboard request without rendering the raw error', async () => {
    accountsListMock.mockRejectedValue(
      new Error('private account response details'),
    );
    render(<DashboardPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load your financial summary.");
    expect(alert).toHaveTextContent('Dashboard request: accounts.');
    expect(
      screen.queryByText(/private account response details/),
    ).toBeNull();
  });

  it('uses a safe fallback for malformed or unrecognized error envelopes', async () => {
    summaryMock.mockRejectedValue({
      error: {
        code: 'PRIVATE_UNKNOWN_CODE',
        message: 'private server message',
        requestId: 'private-request-id',
      },
      stack: 'private stack trace',
      token: 'private-token',
      rawResponse: 'private raw body',
    });
    render(<DashboardPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load your financial summary.");
    expect(alert).toHaveTextContent('Dashboard request: summary.');
    expect(
      screen.queryByText(
        /PRIVATE_UNKNOWN_CODE|private server message|private-request-id|private stack trace|private-token|private raw body/,
      ),
    ).toBeNull();
  });
});
