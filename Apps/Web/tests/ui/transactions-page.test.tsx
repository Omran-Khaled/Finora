// Transactions list behaviour: empty vs filtered-empty semantics, clear
// filters, load-more error feedback with retry, and link semantics.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionsPage from '@/app/(app)/transactions/page';
import { toast } from 'sonner';
import type { Account, Transaction } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const listMock = vi.hoisted(() => vi.fn());
const accountsListMock = vi.hoisted(() => vi.fn());
const categoriesListMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  api: {
    transactions: { list: listMock },
    accounts: { list: accountsListMock },
    categories: { list: categoriesListMock },
  },
}));

const account: Account = {
  id: 'acc-1',
  userId: 'u1',
  name: 'Main bank',
  type: 'BANK',
  currencyCode: 'USD',
  openingBalanceMinor: '0',
  balanceMinor: '10000',
  status: 'ACTIVE',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const tx: Transaction = {
  id: 'tx-1',
  userId: 'u1',
  accountId: 'acc-1',
  categoryId: null,
  type: 'INCOME',
  amountMinor: '2500',
  currencyCode: 'USD',
  description: 'Coffee refund',
  transactionDate: '2026-08-20',
  status: 'ACTIVE',
  transferDirection: null,
  createdAt: '2026-08-20T00:00:00Z',
  updatedAt: '2026-08-20T00:00:00Z',
};

function emptyListResult() {
  return Promise.resolve({ data: [], meta: { nextCursor: null } });
}

describe('Transactions page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    accountsListMock.mockResolvedValue([account]);
    categoriesListMock.mockResolvedValue([]);
  });

  it('shows the unfiltered empty state when there are no transactions', async () => {
    listMock.mockResolvedValue(emptyListResult());
    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    });
    expect(screen.queryByText(/No transactions match your filters/i)).not.toBeInTheDocument();
  });

  it('shows the filtered empty state and Clear filters when filters exclude everything', async () => {
    mocks.searchParams = new URLSearchParams('accountId=acc-1');
    listMock.mockResolvedValue(emptyListResult());
    render(<TransactionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('No transactions match your filters')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument();

    // Clearing filters returns to the plain empty state
    listMock.mockResolvedValue(emptyListResult());
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    });
  });

  it('loads more and surfaces a visible error with retry when it fails', async () => {
    listMock
      .mockResolvedValueOnce({
        data: [tx],
        meta: { nextCursor: 'cursor-2' },
      })
      .mockRejectedValueOnce({ error: { code: 'VALIDATION_ERROR', message: 'boom', requestId: 'r' } });

    render(<TransactionsPage />);

    const loadMore = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(loadMore);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to load more transactions. Please try again.'
      );
    });
    // The button remains available so the user can retry
    expect(screen.getByRole('button', { name: /load more/i })).toBeEnabled();
  });

  it('renders transactions as semantic links to their details', async () => {
    listMock.mockResolvedValue({ data: [tx], meta: { nextCursor: null } });
    render(<TransactionsPage />);

    const link = await screen.findByRole('link', { name: /Coffee refund/i });
    expect(link).toHaveAttribute('href', '/transactions/tx-1');
  });
});
