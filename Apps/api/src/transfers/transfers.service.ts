import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InMemoryStore, TransferRecord } from "../core/store";
import { fromMinor, toSafeMinor, MoneyInput } from "../core/money";
import { PrismaAccountRepository } from "../database/repositories/prisma-account.repository";
import { PrismaTransferRepository } from "../database/repositories/transfer.repository";
import { PrismaTransactionRepository } from "../database/repositories/transaction.repository";
import { assertMatchingFingerprint, fingerprint } from "../core/idempotency";
import { isPrismaPersistenceEnabled } from "../config/persistence";

@Injectable()
export class TransfersService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly accounts?: PrismaAccountRepository,
    private readonly persistent?: PrismaTransferRepository,
    private readonly transactions?: PrismaTransactionRepository,
  ) {}

  async create(
    userId: string,
    input: {
      fromAccountId: string;
      toAccountId: string;
      amountMinor: MoneyInput;
      transactionDate: string;
    },
    idempotencyKey?: string,
  ) {
    // Branch first: when Prisma is enabled the persistent repositories are the
    // single source of truth and the in-memory store must stay untouched.
    const persistentMode = this.enabled() && !!this.persistent;
    // Q-001: reject amounts that cannot survive the JSON <-> BIGINT round trip.
    const amountMinor = toSafeMinor(input.amountMinor);
    const payloadFingerprint = fingerprint({
      amountMinor,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      transactionDate: input.transactionDate,
    });
    if (persistentMode && idempotencyKey && this.persistent) {
      const persisted = await this.persistent.findByIdempotency(
        userId,
        idempotencyKey,
      );
      if (persisted) {
        assertMatchingFingerprint(persisted.payloadFingerprint, payloadFingerprint);
        return this.view(userId, persisted);
      }
    }
    if (!persistentMode && idempotencyKey) {
      const existingId = this.store.transfersByIdempotency.get(
        `${userId}:${idempotencyKey}`,
      );
      if (existingId) {
        assertMatchingFingerprint(
          this.store.transferIdempotencyFingerprints.get(`${userId}:${idempotencyKey}`),
          payloadFingerprint,
        );
        return this.get(userId, existingId);
      }
    }
    const source =
      this.enabled() && this.accounts
        ? await this.accounts.findByIdForUser(userId, input.fromAccountId)
        : this.store.accounts.get(input.fromAccountId);
    const destination =
      this.enabled() && this.accounts
        ? await this.accounts.findByIdForUser(userId, input.toAccountId)
        : this.store.accounts.get(input.toAccountId);
    if (
      !source ||
      source.userId !== userId ||
      !destination ||
      destination.userId !== userId
    )
      throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    if (source.id === destination.id)
      throw new UnprocessableEntityException({ code: "SAME_ACCOUNT_TRANSFER" });
    if (source.status === "ARCHIVED" || destination.status === "ARCHIVED")
      throw new UnprocessableEntityException({ code: "ACCOUNT_ARCHIVED" });
    if (source.currencyCode !== destination.currencyCode)
      throw new UnprocessableEntityException({
        code: "CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED",
      });
    if (idempotencyKey) {
      const existingId = this.store.transfersByIdempotency.get(`${userId}:${idempotencyKey}`);
      if (existingId) {
        assertMatchingFingerprint(
          this.store.transferIdempotencyFingerprints.get(`${userId}:${idempotencyKey}`),
          payloadFingerprint,
        );
        return this.get(userId, existingId);
      }
    }
    const sourceTransactionId = this.store.id();
    const destinationTransactionId = this.store.id();
    const transfer: TransferRecord = {
      id: this.store.id(),
      userId,
      sourceTransactionId,
      destinationTransactionId,
      idempotencyKey,
      payloadFingerprint,
      createdAt: new Date().toISOString(),
    };
    if (persistentMode && this.persistent)
      return this.view(
        userId,
        await this.persistent.create({
          transfer,
          source: amountMinor,
          destination: amountMinor,
          userId,
          sourceAccountId: source.id,
          destinationAccountId: destination.id,
          currency: source.currencyCode,
          date: input.transactionDate,
          sourceDescription: `Transfer to ${destination.name}`,
          destinationDescription: `Transfer from ${source.name}`,
        }),
      );
    this.store.transactions.set(sourceTransactionId, {
      id: sourceTransactionId,
      userId,
      accountId: source.id,
      categoryId: null,
      type: "TRANSFER",
      amountMinor,
      currencyCode: source.currencyCode,
      description: `Transfer to ${destination.name}`,
      transactionDate: input.transactionDate,
      status: "ACTIVE",
      transferDirection: "SOURCE",
      createdAt: transfer.createdAt,
      updatedAt: transfer.createdAt,
    });
    this.store.transactions.set(destinationTransactionId, {
      id: destinationTransactionId,
      userId,
      accountId: destination.id,
      categoryId: null,
      type: "TRANSFER",
      amountMinor,
      currencyCode: destination.currencyCode,
      description: `Transfer from ${source.name}`,
      transactionDate: input.transactionDate,
      status: "ACTIVE",
      transferDirection: "DESTINATION",
      createdAt: transfer.createdAt,
      updatedAt: transfer.createdAt,
    });
    this.store.transfers.set(transfer.id, transfer);
    if (idempotencyKey)
      this.store.transfersByIdempotency.set(
        `${userId}:${idempotencyKey}`,
        transfer.id,
      );
    if (idempotencyKey)
      this.store.transferIdempotencyFingerprints.set(
        `${userId}:${idempotencyKey}`,
        payloadFingerprint,
      );
    return this.view(userId, transfer);
  }

  async get(userId: string, id: string) {
    if (this.enabled() && this.persistent) {
      const transfer = await this.persistent.findForUser(userId, id);
      if (!transfer)
        throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
      return this.view(userId, transfer);
    }

    const transfer = this.store.transfers.get(id) ?? [...this.store.transfers.values()].find(
      (candidate) =>
        candidate.userId === userId &&
        (candidate.sourceTransactionId === id || candidate.destinationTransactionId === id),
    );
    if (!transfer || transfer.userId !== userId)
      throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    return this.view(userId, transfer);
  }

  async update(userId: string, id: string, transactionDate?: string) {
    const transfer =
      this.enabled() && this.persistent
        ? await this.persistent.findForUser(userId, id)
        : this.store.transfers.get(id) ?? [...this.store.transfers.values()].find(
            (candidate) =>
              candidate.userId === userId &&
              (candidate.sourceTransactionId === id || candidate.destinationTransactionId === id),
          );
    if (!transfer || transfer.userId !== userId)
      throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    if (transactionDate) {
      if (this.enabled() && this.persistent) {
        await this.persistent.updateDate(transfer, transactionDate);
      } else {
        const source = this.store.transactions.get(
          transfer.sourceTransactionId,
        );
        const destination = this.store.transactions.get(
          transfer.destinationTransactionId,
        );
        if (source) {
          source.transactionDate = transactionDate;
          source.updatedAt = new Date().toISOString();
        }
        if (destination) {
          destination.transactionDate = transactionDate;
          destination.updatedAt = new Date().toISOString();
        }
      }
    }
    return this.view(userId, transfer);
  }

  async void(userId: string, id: string) {
    if (this.enabled() && this.persistent) {
      const transfer = await this.persistent.findForUser(userId, id);
      if (!transfer)
        throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
      const changed = await this.persistent.voidIfActive(transfer);
      if (!changed)
        throw new UnprocessableEntityException({
          code: "TRANSACTION_ALREADY_VOIDED",
        });
      return this.view(userId, transfer);
    }
    const transfer = this.store.transfers.get(id) ?? [...this.store.transfers.values()].find(
      (candidate) =>
        candidate.userId === userId &&
        (candidate.sourceTransactionId === id || candidate.destinationTransactionId === id),
    );
    if (!transfer || transfer.userId !== userId)
      throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    const source = this.store.transactions.get(transfer.sourceTransactionId);
    const destination = this.store.transactions.get(
      transfer.destinationTransactionId,
    );
    if (!source || !destination)
      throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    if (
      source.type !== "TRANSFER" ||
      source.transferDirection !== "SOURCE" ||
      destination.type !== "TRANSFER" ||
      destination.transferDirection !== "DESTINATION"
    )
      throw new UnprocessableEntityException({
        code: "INVALID_TRANSFER",
        message: "Transfer legs are inconsistent.",
      });
    if (source.status !== "ACTIVE" || destination.status !== "ACTIVE")
      throw new UnprocessableEntityException({
        code: "TRANSACTION_ALREADY_VOIDED",
      });
    if (
      this.store.accountBalance(destination.accountId) -
        destination.amountMinor <
      0n
    )
      throw new UnprocessableEntityException({ code: "INSUFFICIENT_FUNDS" });
    // Validate both legs and their resulting balances before mutating either:
    // transfer void is one atomic operation in memory and persistent modes.
    const voidedAt = new Date().toISOString();
    source.status = "VOIDED";
    source.updatedAt = voidedAt;
    destination.status = "VOIDED";
    destination.updatedAt = voidedAt;
    return this.view(userId, transfer);
  }

  private async view(userId: string, transfer: TransferRecord) {
    const source = this.enabled() && this.transactions
      ? await this.transactions.findForUser(userId, transfer.sourceTransactionId)
      : this.store.transactions.get(transfer.sourceTransactionId);
    const destination = this.enabled() && this.transactions
      ? await this.transactions.findForUser(userId, transfer.destinationTransactionId)
      : this.store.transactions.get(transfer.destinationTransactionId);
    if (!source || !destination)
      throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    return {
      transfer: {
        id: transfer.id,
        userId: transfer.userId,
        sourceTransactionId: transfer.sourceTransactionId,
        destinationTransactionId: transfer.destinationTransactionId,
        createdAt: transfer.createdAt,
      },
      sourceTx: this.transactionView(source),
      destinationTx: this.transactionView(destination),
    };
  }

  private transactionView(transaction: {
    id: string;
    userId: string;
    accountId: string;
    categoryId: string | null;
    type: "INCOME" | "EXPENSE" | "TRANSFER";
    amountMinor: bigint;
    currencyCode: string;
    description: string | null;
    transactionDate: string;
    status: "ACTIVE" | "VOIDED";
    transferDirection?: "SOURCE" | "DESTINATION";
    createdAt: string;
    updatedAt: string;
  }) {
    return {
      id: transaction.id,
      userId: transaction.userId,
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
      type: transaction.type,
      amountMinor: fromMinor(transaction.amountMinor),
      currencyCode: transaction.currencyCode,
      description: transaction.description,
      transactionDate: transaction.transactionDate,
      status: transaction.status,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      transferDirection: transaction.transferDirection ?? null,
    };
  }
  private enabled(): boolean {
    return isPrismaPersistenceEnabled();
  }
}
