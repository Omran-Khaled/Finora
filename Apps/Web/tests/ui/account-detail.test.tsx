import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountDetailPage from '@/app/(app)/accounts/[id]/page';
import { toast } from 'sonner';
import type { Account } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  transactionsList: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: 'acc-1' }),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('@/lib/api-client', () => ({
  api: {
    accounts: {
      get: mocks.get,
      update: mocks.update,
      archive: mocks.archive,
    },
    transactions: { list: mocks.transactionsList },
  },
}));

const account: Account = {
  id: 'acc-1',
  userId: 'user-1',
  name: 'Main bank',
  type: 'BANK',
  currencyCode: 'USD',
  openingBalanceMinor: '0',
  balanceMinor: '5000',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Web account details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(account);
    mocks.transactionsList.mockResolvedValue({ data: [], meta: { nextCursor: null } });
  });

  it('keeps separate edit and archive actions and surfaces active-goal archive blockers', async () => {
    mocks.archive.mockRejectedValue({
      error: {
        code: 'ACCOUNT_HAS_ACTIVE_GOAL',
        message: 'An account with an active savings goal cannot be archived.',
        requestId: 'req_account_archive',
      },
    });
    const user = userEvent.setup();
    render(<AccountDetailPage />);

    expect(await screen.findByRole('button', { name: 'Edit account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accounts' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archive account' }));
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'An account with an active savings goal cannot be archived.'
      );
    });
    expect(mocks.archive).toHaveBeenCalledWith('acc-1');
  });
});
