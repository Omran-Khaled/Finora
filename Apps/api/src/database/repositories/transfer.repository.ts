import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma.service';
import { TransferRecord } from '../../core/store';
import { assertMatchingFingerprint } from '../../core/idempotency';
import {
  lockAccountsAndReadBalances,
  lockAccountsAndReadBalancesIncludingArchived,
} from '../prisma-financial';

@Injectable()
export class PrismaTransferRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findForUser(userId: string, id: string): Promise<TransferRecord | null> {
    const transfer = await this.prisma.db.transfer.findFirst({ where: { userId, OR: [{ id }, { sourceTransactionId: id }, { destinationTransactionId: id }] } });
    return transfer ? this.toDomain(transfer) : null;
  }
  async findByIdempotency(userId: string, key: string): Promise<TransferRecord | null> {
    const transfer = await this.prisma.db.transfer.findFirst({ where: { userId, idempotencyKey: key } });
    return transfer ? this.toDomain(transfer) : null;
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
  ): Promise<TransferRecord | null> {
    const existing = await tx.transfer.findFirst({ where: { userId, idempotencyKey } });
    if (!existing) return null;
    assertMatchingFingerprint(existing.payloadFingerprint ?? undefined, requestedFingerprint);
    return this.toDomain(existing);
  }
  private toDomain(row: {
    id: string; userId: string; sourceTransactionId: string; destinationTransactionId: string;
    idempotencyKey?: string | null; payloadFingerprint?: string | null; createdAt: Date;
  }): TransferRecord {
    return {
      id: row.id,
      userId: row.userId,
      sourceTransactionId: row.sourceTransactionId,
      destinationTransactionId: row.destinationTransactionId,
      idempotencyKey: row.idempotencyKey ?? undefined,
      payloadFingerprint: row.payloadFingerprint ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
  async create(input: { transfer: TransferRecord; source: bigint; destination: bigint; userId: string; sourceAccountId: string; destinationAccountId: string; currency: string; date: string; sourceDescription: string; destinationDescription: string }): Promise<TransferRecord> {
    try {
      return await this.prisma.db.$transaction(async (tx: Prisma.TransactionClient) => {
        // Idempotency is resolved as the first branch of the atomic write instead of
        // as a late uniqueness-error recovery: a concurrent replay must return the
        // original resource before any balance/business constraint is evaluated,
        // otherwise it observes the post-success balance and fails with
        // INSUFFICIENT_FUNDS.
        if (input.transfer.idempotencyKey) {
          const replay = await this.resolveIdempotentReplay(tx, input.userId, input.transfer.idempotencyKey, input.transfer.payloadFingerprint ?? '');
          if (replay) return replay;
        }
        const balances = await lockAccountsAndReadBalances(tx, [
          input.sourceAccountId,
          input.destinationAccountId,
        ]);
        // Both account rows are locked (sorted order, so both legs always follow the
        // same lock sequence): a concurrent request using the same key may have
        // committed while this transaction waited for those locks, so the lookup is
        // repeated against the post-commit read snapshot before the balance or the
        // transfer legs are written.
        if (input.transfer.idempotencyKey) {
          const raced = await this.resolveIdempotentReplay(tx, input.userId, input.transfer.idempotencyKey, input.transfer.payloadFingerprint ?? '');
          if (raced) return raced;
        }
        if ((balances.get(input.sourceAccountId) ?? 0n) < input.source) {
          throw new UnprocessableEntityException({ code: 'INSUFFICIENT_FUNDS' });
        }
        const createdAt = new Date(input.transfer.createdAt);
        await tx.transaction.createMany({ data: [
          { id: input.transfer.sourceTransactionId, userId: input.userId, accountId: input.sourceAccountId, type: 'TRANSFER', amountMinor: input.source, currencyCode: input.currency, description: input.sourceDescription, transactionDate: new Date(input.date), status: 'ACTIVE', transferDirection: 'SOURCE', idempotencyKey: null, payloadFingerprint: input.transfer.payloadFingerprint, createdAt, updatedAt: createdAt },
          { id: input.transfer.destinationTransactionId, userId: input.userId, accountId: input.destinationAccountId, type: 'TRANSFER', amountMinor: input.destination, currencyCode: input.currency, description: input.destinationDescription, transactionDate: new Date(input.date), status: 'ACTIVE', transferDirection: 'DESTINATION', idempotencyKey: null, payloadFingerprint: input.transfer.payloadFingerprint, createdAt, updatedAt: createdAt },
        ] });
        const created = await tx.transfer.create({ data: { id: input.transfer.id, userId: input.userId, sourceTransactionId: input.transfer.sourceTransactionId, destinationTransactionId: input.transfer.destinationTransactionId, idempotencyKey: input.transfer.idempotencyKey, payloadFingerprint: input.transfer.payloadFingerprint, createdAt } });
        return this.toDomain(created);
      });
    } catch (error) {
      // Final race safeguard: the unique index on (user_id, idempotency_key) wins,
      // so the canonical row is re-read and the fingerprint rule applied to it.
      if (input.transfer.idempotencyKey && error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findByIdempotency(input.userId, input.transfer.idempotencyKey);
        if (existing) {
          assertMatchingFingerprint(existing.payloadFingerprint, input.transfer.payloadFingerprint ?? '');
          return existing;
        }
      }
      throw error;
    }
  }

  async voidIfActive(transfer: TransferRecord): Promise<boolean> {
    return this.prisma.db.$transaction(async (tx) => {
      const ids = [transfer.sourceTransactionId, transfer.destinationTransactionId].sort();
      // Account rows are the serialization point for every balance mutation.
      // Discover the affected accounts without locking transactions, then lock
      // accounts in sorted order before locking/re-reading either leg.
      const candidates = await tx.$queryRaw<Array<{ id: string; accountId: string }>>`
        SELECT id, account_id AS "accountId"
        FROM transactions
        WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id
      `;
      if (candidates.length !== 2) throw new Error('Transfer legs are inconsistent.');
      const accountIds = candidates.map((row) => row.accountId);
      const balances = await lockAccountsAndReadBalancesIncludingArchived(tx, accountIds);
      const rows = await tx.$queryRaw<Array<{
        id: string;
        userId: string;
        accountId: string;
        type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
        transferDirection: 'SOURCE' | 'DESTINATION' | null;
        amountMinor: bigint;
        status: 'ACTIVE' | 'VOIDED';
      }>>`
        SELECT id, status, user_id AS "userId", account_id AS "accountId", type,
          transfer_direction AS "transferDirection", amount_minor AS "amountMinor"
        FROM transactions
        WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id
        FOR UPDATE
      `;
      if (rows.length !== 2) throw new Error('Transfer legs are inconsistent.');
      if (rows.some((row) => row.status !== 'ACTIVE')) return false;
      const rowById = new Map(rows.map((row) => [row.id, row]));
      const source = rowById.get(transfer.sourceTransactionId);
      const destination = rowById.get(transfer.destinationTransactionId);
      if (
        !source ||
        !destination ||
        source.userId !== transfer.userId ||
        destination.userId !== transfer.userId ||
        source.type !== 'TRANSFER' ||
        source.transferDirection !== 'SOURCE' ||
        destination.type !== 'TRANSFER' ||
        destination.transferDirection !== 'DESTINATION'
      ) {
        throw new Error('Transfer legs are inconsistent.');
      }
      const candidateAccountById = new Map(candidates.map((row) => [row.id, row.accountId]));
      if (
        source.accountId !== candidateAccountById.get(source.id) ||
        destination.accountId !== candidateAccountById.get(destination.id) ||
        source.accountId === destination.accountId
      ) {
        throw new Error('Transfer account lock failed.');
      }
      // Voiding removes the destination credit. Do not allow that removal to
      // make its balance negative; the source debit removal only increases its
      // balance.
      if (
        (balances.get(destination.accountId) ?? 0n) - destination.amountMinor < 0n
      ) {
        throw new UnprocessableEntityException({ code: 'INSUFFICIENT_FUNDS' });
      }
      const result = await tx.transaction.updateMany({
        where: { id: { in: ids }, status: 'ACTIVE' },
        data: { status: 'VOIDED' },
      });
      if (result.count !== 2) throw new Error('Transfer legs changed while locked.');
      return true;
    });
  }

  /** F-016: the current status of both legs, used to reject a double void with 422. */
  async legStatuses(transfer: TransferRecord): Promise<('ACTIVE' | 'VOIDED')[]> {
    const rows = await this.prisma.db.transaction.findMany({
      where: { id: { in: [transfer.sourceTransactionId, transfer.destinationTransactionId] } },
      select: { status: true },
    });
    return rows.map((row: { status: 'ACTIVE' | 'VOIDED' }) => row.status);
  }

  async updateDate(transfer: TransferRecord, transactionDate: string): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      const ids = [transfer.sourceTransactionId, transfer.destinationTransactionId].sort();
      const rows = await tx.$queryRaw<Array<{ id: string; status: 'ACTIVE' | 'VOIDED' }>>`
        SELECT id, status
        FROM transactions
        WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id
        FOR UPDATE
      `;
      if (rows.length !== 2) throw new UnprocessableEntityException({ code: 'TRANSACTION_NOT_FOUND' });
      if (rows.some((row) => row.status !== 'ACTIVE')) {
        throw new UnprocessableEntityException({ code: 'TRANSACTION_ALREADY_VOIDED' });
      }
      await tx.transaction.updateMany({
        where: { id: { in: ids }, status: 'ACTIVE' },
        data: { transactionDate: new Date(transactionDate) },
      });
    });
  }
}
