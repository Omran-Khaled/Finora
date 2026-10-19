import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';

export async function lockAccountsAndReadBalances(
  tx: Prisma.TransactionClient,
  accountIds: string[],
): Promise<Map<string, bigint>> {
  const lockedAccounts = await lockAccountRows(tx, accountIds);
  if (lockedAccounts.some((account) => account.status !== 'ACTIVE')) {
    throw new UnprocessableEntityException({ code: 'ACCOUNT_ARCHIVED' });
  }
  return readAccountBalances(tx, accountIds);
}

/**
 * Void operations remain valid for archived accounts, but still need the same
 * sorted account-row locks as ordinary financial writes.
 */
export async function lockAccountsAndReadBalancesIncludingArchived(
  tx: Prisma.TransactionClient,
  accountIds: string[],
): Promise<Map<string, bigint>> {
  await lockAccountRows(tx, accountIds);
  return readAccountBalances(tx, accountIds);
}

async function lockAccountRows(
  tx: Prisma.TransactionClient,
  accountIds: string[],
): Promise<Array<{ id: string; status: 'ACTIVE' | 'ARCHIVED' }>> {
  const uniqueAccountIds = [...new Set(accountIds)].sort();
  const lockedAccounts = await tx.$queryRaw<Array<{ id: string; status: 'ACTIVE' | 'ARCHIVED' }>>`
    SELECT id, status
    FROM accounts
    WHERE id IN (${Prisma.join(uniqueAccountIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id
    FOR UPDATE
  `;
  if (lockedAccounts.length !== uniqueAccountIds.length) {
    throw new Error('Financial authorization account lock failed.');
  }
  return lockedAccounts;
}

async function readAccountBalances(
  tx: Prisma.TransactionClient,
  accountIds: string[],
): Promise<Map<string, bigint>> {
  const uniqueAccountIds = [...new Set(accountIds)].sort();
  const accounts = await tx.account.findMany({
    where: { id: { in: uniqueAccountIds } },
    select: {
      id: true,
      openingBalanceMinor: true,
      transactions: {
        where: { status: 'ACTIVE' },
        select: { type: true, transferDirection: true, amountMinor: true },
      },
    },
  });
  return new Map(accounts.map((account) => [
    account.id,
    account.transactions.reduce((balance, transaction) => {
      if (transaction.type === 'INCOME' || transaction.transferDirection === 'DESTINATION') {
        return balance + transaction.amountMinor;
      }
      return balance - transaction.amountMinor;
    }, account.openingBalanceMinor),
  ]));
}
