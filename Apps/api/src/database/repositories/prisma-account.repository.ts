import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountRepository } from './account.repository';
import { AccountRecord } from '../../core/store';
import { Page, PageRequest, prismaPageArgs, toPage } from '../../core/pagination';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdForUser(userId: string, accountId: string): Promise<AccountRecord | null> {
    const account = await this.prisma.db.account.findFirst({ where: { id: accountId, userId } });
    return account ? this.toDomain(account) : null;
  }

  async listForUser(userId: string, page?: PageRequest): Promise<Page<AccountRecord>> {
    const accounts = await this.prisma.db.account.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...prismaPageArgs(page),
    });
    return toPage(accounts.map((account: {
      id: string;
      userId: string;
      name: string;
      type: 'CASH' | 'BANK' | 'SAVINGS';
      currencyCode: string;
      openingBalanceMinor: bigint;
      status: 'ACTIVE' | 'ARCHIVED';
    }) => this.toDomain(account)), page);
  }

  async create(account: AccountRecord): Promise<AccountRecord> {
    const saved = await this.prisma.db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Serialize account creation with profile currency changes on the
      // authoritative user row. Both operations take this lock before
      // checking the cross-table invariant.
      const users = await tx.$queryRaw<Array<{ id: string; baseCurrency: string }>>`
        SELECT id, base_currency AS "baseCurrency"
        FROM users
        WHERE id = ${account.userId}::uuid
        FOR UPDATE
      `;
      const user = users[0];
      if (!user || user.baseCurrency.toUpperCase() !== account.currencyCode.toUpperCase()) {
        throw new UnprocessableEntityException({ code: 'BASE_CURRENCY_MISMATCH' });
      }
      return tx.account.create({
        data: {
          id: account.id,
          userId: account.userId,
          name: account.name,
          type: account.type,
          currencyCode: account.currencyCode,
          openingBalanceMinor: account.openingBalanceMinor,
          status: account.status,
        },
      });
    });
    return this.toDomain(saved);
  }

  async archiveIfActive(userId: string, accountId: string): Promise<AccountRecord | null> {
    return this.prisma.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: 'ACTIVE' | 'ARCHIVED' }>>`
        SELECT id, status
        FROM accounts
        WHERE id = ${accountId}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) return null;
      if (row.status === 'ARCHIVED') {
        throw new UnprocessableEntityException({
          code: 'ACCOUNT_ARCHIVED',
          message: 'The account is already archived.',
        });
      }
      const activeGoals = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM savings_goals
        WHERE account_id = ${accountId}::uuid AND status = 'ACTIVE'
        FOR UPDATE
      `;
      if (activeGoals.length > 0) {
        throw new UnprocessableEntityException({
          code: 'ACCOUNT_HAS_ACTIVE_GOAL',
          message: 'An account with an active savings goal cannot be archived.',
        });
      }
      const saved = await tx.account.update({
        where: { id: accountId },
        data: { status: 'ARCHIVED' },
      });
      return this.toDomain(saved);
    });
  }

  async updateName(userId: string, accountId: string, name: string): Promise<AccountRecord | null> {
    const result = await this.prisma.db.account.updateMany({
      where: { id: accountId, userId },
      data: { name },
    });
    if (result.count === 0) return null;
    return this.findByIdForUser(userId, accountId);
  }

  async balance(accountId: string): Promise<bigint> {
    const account = await this.prisma.db.account.findUnique({
      where: { id: accountId },
      include: { transactions: { where: { status: 'ACTIVE' } } },
    });
    if (!account) return 0n;
    // Transfer legs must honour their direction (FI-002): the SOURCE account is
    // debited, the DESTINATION account is credited. INCOME/EXPENSE keep their sign.
    return account.transactions.reduce((balance: bigint, transaction: { type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; transferDirection: 'SOURCE' | 'DESTINATION' | null; amountMinor: bigint }) => {
      if (transaction.type === 'INCOME' || transaction.transferDirection === 'DESTINATION') return balance + transaction.amountMinor;
      return balance - transaction.amountMinor;
    }, account.openingBalanceMinor);
  }

  async balancesForUser(userId: string): Promise<Map<string, bigint>> {
    const rows = await this.prisma.db.$queryRaw<Array<{ accountId: string; balanceMinor: bigint }>>`
      SELECT
        a.id AS "accountId",
        (a.opening_balance_minor + COALESCE(SUM(
          CASE
            WHEN t.id IS NULL THEN 0
            WHEN t.type = 'INCOME' OR t.transfer_direction = 'DESTINATION' THEN t.amount_minor
            ELSE -t.amount_minor
          END
        ), 0))::bigint AS "balanceMinor"
      FROM accounts a
      LEFT JOIN transactions t
        ON t.account_id = a.id
       AND t.status = 'ACTIVE'
      WHERE a.user_id = ${userId}::uuid
      GROUP BY a.id, a.opening_balance_minor
    `;
    return new Map(rows.map((row) => [row.accountId, row.balanceMinor]));
  }

  async hasAccounts(userId: string): Promise<boolean> {
    return (await this.prisma.db.account.count({ where: { userId } })) > 0;
  }

  async findUserBaseCurrency(userId: string): Promise<string | null> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { baseCurrency: true },
    });
    return user?.baseCurrency ?? null;
  }

  private toDomain(account: {
    id: string;
    userId: string;
    name: string;
    type: 'CASH' | 'BANK' | 'SAVINGS';
    currencyCode: string;
    openingBalanceMinor: bigint;
    status: 'ACTIVE' | 'ARCHIVED';
  }): AccountRecord {
    return { ...account };
  }
}
