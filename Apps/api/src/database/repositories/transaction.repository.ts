import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { TransactionRecord, TransactionType } from '../../core/store';
import { Page, PageRequest, prismaPageArgs, toPage } from '../../core/pagination';
import { PrismaService } from '../prisma.service';
import { assertMatchingFingerprint } from '../../core/idempotency';
import {
  lockAccountsAndReadBalances,
  lockAccountsAndReadBalancesIncludingArchived,
} from '../prisma-financial';

@Injectable()
export class PrismaTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    filters: { accountId?: string; categoryId?: string; type?: TransactionType; from?: string; to?: string },
    page?: PageRequest,
  ): Promise<Page<TransactionRecord>> {
    let rows;
    try {
      rows = await this.prisma.db.transaction.findMany({
        where: {
          userId,
          accountId: filters.accountId,
          categoryId: filters.categoryId,
          type: filters.type,
          transactionDate: { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined },
        },
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        ...prismaPageArgs(page),
      });
    } catch (error) {
      // A cursor whose row no longer exists (deleted/replayed) ends the sequence.
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
        return { data: [], nextCursor: null };
      }
      throw error;
    }
    return toPage(rows.map((row: {
      id: string; userId: string; accountId: string; categoryId: string | null;
      type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amountMinor: bigint; currencyCode: string;
      description: string | null; transactionDate: Date; status: 'ACTIVE' | 'VOIDED';
      transferDirection: 'SOURCE' | 'DESTINATION' | null;
      createdAt: Date; updatedAt: Date;
    }) => this.toDomain(row)), page);
  }

  async monthlyTotals(
    userId: string,
    from: string,
    to: string,
  ): Promise<{ income: bigint; expenses: bigint }> {
    const rows = await this.prisma.db.$queryRaw<Array<{ incomeMinor: bigint; expenseMinor: bigint }>>`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount_minor ELSE 0 END), 0)::bigint AS "incomeMinor",
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount_minor ELSE 0 END), 0)::bigint AS "expenseMinor"
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND status = 'ACTIVE'
        AND transaction_date >= ${new Date(from)}::date
        AND transaction_date <= ${new Date(to)}::date
    `;
    const row = rows[0] ?? { incomeMinor: 0n, expenseMinor: 0n };
    return { income: row.incomeMinor, expenses: row.expenseMinor };
  }

  async activeExpenseTotalForCategory(
    userId: string,
    categoryId: string,
    from: string,
    to: string,
  ): Promise<bigint> {
    const rows = await this.prisma.db.$queryRaw<Array<{ totalMinor: string }>>`
      SELECT COALESCE(SUM(amount_minor), 0)::text AS "totalMinor"
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND category_id = ${categoryId}::uuid
        AND type = 'EXPENSE'
        AND status = 'ACTIVE'
        AND transaction_date >= ${new Date(from)}::date
        AND transaction_date <= ${new Date(to)}::date
    `;
    return BigInt(rows[0]?.totalMinor ?? "0");
  }

  async expenseTotalsByCategory(
    userId: string,
    from: string,
    to: string,
  ): Promise<Map<string, bigint>> {
    const rows = await this.prisma.db.$queryRaw<Array<{ categoryId: string | null; totalMinor: bigint }>>`
      SELECT category_id AS "categoryId", COALESCE(SUM(amount_minor), 0)::bigint AS "totalMinor"
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND type = 'EXPENSE'
        AND status = 'ACTIVE'
        AND transaction_date >= ${new Date(from)}::date
        AND transaction_date <= ${new Date(to)}::date
      GROUP BY category_id
    `;
    return new Map(
      rows
        .filter((row) => row.categoryId !== null)
        .map((row) => [row.categoryId as string, row.totalMinor]),
    );
  }

  async findForUser(userId: string, id: string): Promise<TransactionRecord | null> {
    const row = await this.prisma.db.transaction.findFirst({ where: { id, userId } });
    return row ? this.toDomain(row) : null;
  }

  async findByIdempotency(userId: string, key: string): Promise<TransactionRecord | null> {
    const row = await this.prisma.db.transaction.findFirst({ where: { userId, idempotencyKey: key } });
    return row ? this.toDomain(row) : null;
  }

  async create(transaction: TransactionRecord, idempotencyKey?: string): Promise<TransactionRecord> {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        // Idempotency is resolved as the first branch of the atomic write instead of
        // as a late uniqueness-error recovery: a concurrent replay must return the
        // original resource before any balance/business constraint is evaluated,
        // otherwise it observes the post-success balance and fails with
        // INSUFFICIENT_FUNDS.
        if (idempotencyKey) {
          const replay = await this.resolveIdempotentReplay(tx, transaction.userId, idempotencyKey, transaction.payloadFingerprint ?? '');
          if (replay) return replay;
        }
        const balances = await lockAccountsAndReadBalances(tx, [transaction.accountId]);
        // The account row lock is the serialization point for this account: a
        // concurrent request using the same key may have committed while this
        // transaction waited for that lock, so the lookup is repeated against the
        // post-commit read snapshot before the balance is judged.
        if (idempotencyKey) {
          const raced = await this.resolveIdempotentReplay(tx, transaction.userId, idempotencyKey, transaction.payloadFingerprint ?? '');
          if (raced) return raced;
        }
        if (transaction.type === 'EXPENSE' && (balances.get(transaction.accountId) ?? 0n) < transaction.amountMinor) {
          throw new UnprocessableEntityException({ code: 'INSUFFICIENT_FUNDS' });
        }
        if (transaction.categoryId) {
          const categories = await tx.$queryRaw<Array<{ id: string; userId: string | null; type: 'INCOME' | 'EXPENSE'; status: 'ACTIVE' | 'ARCHIVED' }>>`
            SELECT id, user_id AS "userId", type, status
            FROM categories
            WHERE id = ${transaction.categoryId}::uuid
            FOR UPDATE
          `;
          const category = categories[0];
          if (!category || (category.userId !== null && category.userId !== transaction.userId)) {
            throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
          }
          if (category.status === 'ARCHIVED') {
            throw new UnprocessableEntityException({ code: 'CATEGORY_ARCHIVED' });
          }
          if (category.type !== transaction.type) {
            throw new UnprocessableEntityException({ code: 'INVALID_CATEGORY_TYPE' });
          }
        }
        const row = await tx.transaction.create({
          data: {
            id: transaction.id,
            userId: transaction.userId,
            accountId: transaction.accountId,
            categoryId: transaction.categoryId,
            type: transaction.type,
            amountMinor: transaction.amountMinor,
            currencyCode: transaction.currencyCode,
            description: transaction.description,
            transactionDate: new Date(transaction.transactionDate),
            status: transaction.status,
            transferDirection: transaction.transferDirection ?? null,
            idempotencyKey,
            payloadFingerprint: transaction.payloadFingerprint,
          },
        });
        return this.toDomain(row);
      });
    } catch (error) {
      // Final race safeguard: the unique index on (user_id, idempotency_key) wins,
      // so the canonical row is re-read and the fingerprint rule applied to it.
      if (idempotencyKey && error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findByIdempotency(transaction.userId, idempotencyKey);
        if (existing) {
          assertMatchingFingerprint(existing.payloadFingerprint, transaction.payloadFingerprint ?? '');
          return existing;
        }
      }
      throw error;
    }
  }


  /**
   * Resolves an already-persisted `(userId, idempotencyKey)` row inside the
   * caller's transaction. A matching fingerprint returns the canonical resource;
   * a different payload (or a row predating fingerprint storage) is rejected as
   * `DUPLICATE_REQUEST`.
   */
  private async resolveIdempotentReplay(
    tx: Prisma.TransactionClient,
    userId: string,
    idempotencyKey: string,
    requestedFingerprint: string,
  ): Promise<TransactionRecord | null> {
    const existing = await tx.transaction.findFirst({ where: { userId, idempotencyKey } });
    if (!existing) return null;
    assertMatchingFingerprint(existing.payloadFingerprint ?? undefined, requestedFingerprint);
    return this.toDomain(existing);
  }

  async voidIfActive(transaction: TransactionRecord): Promise<TransactionRecord | null> {
    return this.prisma.db.$transaction(async (tx) => {
      // Read the account id first, then acquire locks in the global financial
      // order (account before transaction). Re-read the transaction under lock
      // because this first read is only used to select the account lock.
      const candidates = await tx.$queryRaw<Array<{
        accountId: string;
      }>>`
        SELECT account_id AS "accountId"
        FROM transactions
        WHERE id = ${transaction.id}::uuid AND user_id = ${transaction.userId}::uuid
      `;
      if (candidates.length !== 1) return null;
      const balances = await lockAccountsAndReadBalancesIncludingArchived(tx, [
        candidates[0].accountId,
      ]);
      const rows = await tx.$queryRaw<Array<{
        id: string;
        userId: string;
        accountId: string;
        type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
        transferDirection: 'SOURCE' | 'DESTINATION' | null;
        amountMinor: bigint;
        status: 'ACTIVE' | 'VOIDED';
      }>>`
        SELECT id, user_id AS "userId", account_id AS "accountId", type,
          transfer_direction AS "transferDirection", amount_minor AS "amountMinor", status
        FROM transactions
        WHERE id = ${transaction.id}::uuid AND user_id = ${transaction.userId}::uuid
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row || row.status !== 'ACTIVE') return null;
      if (row.accountId !== candidates[0].accountId) return null;
      if (row.type === 'TRANSFER') {
        throw new UnprocessableEntityException({
          code: 'INVALID_TRANSFER',
          message: 'Transfer legs can only be changed through the transfer resource.',
        });
      }
      if (
        row.type === 'INCOME' &&
        (balances.get(row.accountId) ?? 0n) - row.amountMinor < 0n
      ) {
        throw new UnprocessableEntityException({ code: 'INSUFFICIENT_FUNDS' });
      }
      const result = await tx.transaction.updateMany({
        where: { id: transaction.id, userId: transaction.userId, status: 'ACTIVE' },
        data: { status: 'VOIDED' },
      });
      if (result.count !== 1) return null;
      const updated = await tx.transaction.findUnique({ where: { id: transaction.id } });
      return updated ? this.toDomain(updated) : null;
    });
  }

  async update(transaction: TransactionRecord): Promise<TransactionRecord> {
    return this.prisma.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${transaction.id}::uuid AND user_id = ${transaction.userId}::uuid FOR UPDATE`;
      const result = await tx.transaction.updateMany({
        where: { id: transaction.id, userId: transaction.userId, status: 'ACTIVE' },
        data: { description: transaction.description, transactionDate: new Date(transaction.transactionDate) },
      });
      if (result.count !== 1) throw new UnprocessableEntityException({ code: 'TRANSACTION_ALREADY_VOIDED' });
      const row = await tx.transaction.findUnique({ where: { id: transaction.id } });
      if (!row) throw new UnprocessableEntityException({ code: 'TRANSACTION_NOT_FOUND' });
      return this.toDomain(row);
    });
  }

  private toDomain(row: {
    id: string; userId: string; accountId: string; categoryId: string | null;
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amountMinor: bigint; currencyCode: string;
    description: string | null; transactionDate: Date; status: 'ACTIVE' | 'VOIDED';
    transferDirection: 'SOURCE' | 'DESTINATION' | null;
    createdAt: Date; updatedAt: Date;
    idempotencyKey?: string | null;
    payloadFingerprint?: string | null;
  }): TransactionRecord {
    return { id: row.id, userId: row.userId, accountId: row.accountId, categoryId: row.categoryId, type: row.type, amountMinor: row.amountMinor, currencyCode: row.currencyCode, description: row.description, transactionDate: row.transactionDate.toISOString().slice(0, 10), status: row.status, transferDirection: row.transferDirection ?? undefined, idempotencyKey: row.idempotencyKey ?? undefined, payloadFingerprint: row.payloadFingerprint ?? undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
}
