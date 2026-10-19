import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AccountRecord,
  CategoryRecord,
  InMemoryStore,
  TransactionRecord,
  TransactionType,
} from "../core/store";
import { fromMinor, toSafeMinor, MoneyInput } from "../core/money";
import { PageRequest, toPageInMemory } from "../core/pagination";
import { PrismaAccountRepository } from "../database/repositories/prisma-account.repository";
import { PrismaCategoryRepository } from "../database/repositories/category.repository";
import { PrismaTransactionRepository } from "../database/repositories/transaction.repository";
import { assertMatchingFingerprint, fingerprint } from "../core/idempotency";
import { isPrismaPersistenceEnabled } from "../config/persistence";

@Injectable()
export class TransactionsService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly accounts?: PrismaAccountRepository,
    private readonly persistent?: PrismaTransactionRepository,
    private readonly categories?: PrismaCategoryRepository,
  ) {}

  /** Unbounded read for internal aggregate queries (budgets/dashboard). */
  async list(
    userId: string,
    filters: {
      accountId?: string;
      categoryId?: string;
      type?: TransactionType;
      from?: string;
      to?: string;
    },
  ) {
    if (this.enabled() && this.accounts && this.persistent)
      return (await this.persistent.list(userId, filters)).data.map((item) =>
        this.view(item),
      );
    return [...this.store.transactions.values()]
      .filter(
        (item) =>
          item.userId === userId &&
          (!filters.accountId || item.accountId === filters.accountId) &&
          (!filters.categoryId || item.categoryId === filters.categoryId) &&
          (!filters.type || item.type === filters.type) &&
          (!filters.from || item.transactionDate >= filters.from) &&
          (!filters.to || item.transactionDate <= filters.to),
      )
      .map((item) => this.view(item));
  }

  /** Paginated public listing for GET /transactions (F-018 keyset contract). */
  async listPaged(
    userId: string,
    filters: {
      accountId?: string;
      categoryId?: string;
      type?: TransactionType;
      from?: string;
      to?: string;
    },
    page?: PageRequest,
  ) {
    if (this.enabled() && this.accounts && this.persistent) {
      const result = await this.persistent.list(userId, filters, page ?? {});
      return {
        data: result.data.map((item) => this.view(item)),
        nextCursor: result.nextCursor,
      };
    }
    const rows = [...this.store.transactions.values()]
      .filter(
        (item) =>
          item.userId === userId &&
          (!filters.accountId || item.accountId === filters.accountId) &&
          (!filters.categoryId || item.categoryId === filters.categoryId) &&
          (!filters.type || item.type === filters.type) &&
          (!filters.from || item.transactionDate >= filters.from) &&
          (!filters.to || item.transactionDate <= filters.to),
      )
      .sort((a, b) =>
        a.transactionDate < b.transactionDate
          ? 1
          : a.transactionDate > b.transactionDate
            ? -1
            : a.id < b.id
              ? 1
              : a.id > b.id
                ? -1
                : 0,
      );
    const paged = toPageInMemory(rows, page ?? {});
    return {
      data: paged.data.map((item) => this.view(item)),
      nextCursor: paged.nextCursor,
    };
  }

  async create(
    userId: string,
    input: {
      type: Exclude<TransactionType, "TRANSFER">;
      accountId: string;
      categoryId?: string;
      amountMinor: MoneyInput;
      description?: string;
      transactionDate: string;
    },
    idempotencyKey?: string,
  ) {
    // Branch first: Prisma mode must never mutate the in-memory store.
    const persistentMode =
      this.enabled() && !!this.accounts && !!this.persistent;
    // Q-001: reject amounts that cannot survive the JSON <-> BIGINT round trip.
    const amountMinor = toSafeMinor(input.amountMinor);
    const payloadFingerprint = fingerprint({
      accountId: input.accountId,
      amountMinor,
      categoryId: input.categoryId ?? null,
      description: input.description ?? null,
      transactionDate: input.transactionDate,
      type: input.type,
    });
    if (persistentMode && idempotencyKey && this.persistent) {
      const existing = await this.persistent.findByIdempotency(
        userId,
        idempotencyKey,
      );
      if (existing) {
        assertMatchingFingerprint(existing.payloadFingerprint, payloadFingerprint);
        return this.view(existing);
      }
    }
    if (!persistentMode && idempotencyKey) {
      const existingId = this.store.transactionsByIdempotency.get(
        `${userId}:${idempotencyKey}`,
      );
      if (existingId) {
        assertMatchingFingerprint(
          this.store.transactionIdempotencyFingerprints.get(`${userId}:${idempotencyKey}`),
          payloadFingerprint,
        );
        return this.get(userId, existingId);
      }
    }
    if (persistentMode && this.accounts && this.persistent) {
      const account = await this.accounts.findByIdForUser(
        userId,
        input.accountId,
      );
      if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
      if (account.status === "ARCHIVED")
        throw new UnprocessableEntityException({ code: "ACCOUNT_ARCHIVED" });
      if (input.type === "EXPENSE" && !input.categoryId)
        throw new UnprocessableEntityException({
          code: "VALIDATION_ERROR",
          message: "Expense requires a category.",
        });
      // Category ownership/archived rules must hold in Prisma mode exactly as they do in memory mode.
      const category = input.categoryId
        ? await this.persistentCategory(userId, input.categoryId)
        : undefined;
      if (category?.status === "ARCHIVED")
        throw new UnprocessableEntityException({ code: "CATEGORY_ARCHIVED" });
      if (category && category.type !== input.type)
        throw new UnprocessableEntityException({ code: "INVALID_CATEGORY_TYPE" });
      const transaction = await this.persistent.create(
        {
          id: this.store.id(),
          userId,
          accountId: account.id,
          categoryId: category?.id ?? null,
          type: input.type,
          amountMinor,
          currencyCode: account.currencyCode,
          description: input.description ?? null,
          transactionDate: input.transactionDate,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          idempotencyKey,
          payloadFingerprint,
        },
        idempotencyKey,
      );
      return this.view(transaction);
    }
    const account = this.account(userId, input.accountId);
    if (account.status === "ARCHIVED")
      throw new UnprocessableEntityException({ code: "ACCOUNT_ARCHIVED" });
    if (input.type === "EXPENSE" && !input.categoryId)
      throw new UnprocessableEntityException({
        code: "VALIDATION_ERROR",
        message: "Expense requires a category.",
      });
    const category = input.categoryId
      ? this.category(userId, input.categoryId)
      : undefined;
    if (category?.status === "ARCHIVED")
      throw new UnprocessableEntityException({ code: "CATEGORY_ARCHIVED" });
    if (category && category.type !== input.type)
      throw new UnprocessableEntityException({ code: "INVALID_CATEGORY_TYPE" });
    if (
      input.type === "EXPENSE" &&
      this.store.accountBalance(account.id) < amountMinor
    )
      throw new UnprocessableEntityException({ code: "INSUFFICIENT_FUNDS" });
    if (idempotencyKey) {
      const existingId = this.store.transactionsByIdempotency.get(`${userId}:${idempotencyKey}`);
      if (existingId) {
        assertMatchingFingerprint(
          this.store.transactionIdempotencyFingerprints.get(`${userId}:${idempotencyKey}`),
          payloadFingerprint,
        );
        return this.get(userId, existingId);
      }
    }
    const transaction: TransactionRecord = {
      id: this.store.id(),
      userId,
      accountId: account.id,
      categoryId: category?.id ?? null,
      type: input.type,
      amountMinor,
      currencyCode: account.currencyCode,
      description: input.description ?? null,
      transactionDate: input.transactionDate,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotencyKey,
      payloadFingerprint,
    };
    this.store.transactions.set(transaction.id, transaction);
    if (idempotencyKey) {
      this.store.transactionsByIdempotency.set(
        `${userId}:${idempotencyKey}`,
        transaction.id,
      );
      this.store.transactionIdempotencyFingerprints.set(
        `${userId}:${idempotencyKey}`,
        payloadFingerprint,
      );
    }
    return this.view(transaction);
  }

  async get(userId: string, id: string) {
    if (this.enabled() && this.persistent) {
      const transaction = await this.persistent.findForUser(userId, id);
      if (!transaction)
        throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
      return this.view(transaction);
    }
    return this.view(this.owned(userId, id));
  }

  async update(
    userId: string,
    id: string,
    input: { description?: string; transactionDate?: string },
  ) {
    const transaction =
      this.enabled() && this.persistent
        ? await this.persistent.findForUser(userId, id)
        : this.owned(userId, id);
    if (!transaction)
      throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    // F-016: transfer legs are owned by the transfer resource. Editing one leg in
    // isolation would desynchronise the pair, so PATCH is refused in both modes.
    if (transaction.type === "TRANSFER")
      throw new UnprocessableEntityException({
        code: "INVALID_TRANSFER",
        message:
          "Transfer legs can only be changed through the transfer resource.",
      });
    if (transaction.status === "VOIDED")
      throw new UnprocessableEntityException({ code: "TRANSACTION_ALREADY_VOIDED" });
    if (input.description !== undefined)
      transaction.description = input.description;
    if (input.transactionDate !== undefined)
      transaction.transactionDate = input.transactionDate;
    return this.enabled() && this.persistent
      ? this.view(await this.persistent.update(transaction))
      : this.view(transaction);
  }

  async void(userId: string, id: string) {
    const transaction =
      this.enabled() && this.persistent
        ? await this.persistent.findForUser(userId, id)
        : this.owned(userId, id);
    if (!transaction)
      throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    if (transaction.type === "TRANSFER")
      throw new UnprocessableEntityException({
        code: "INVALID_TRANSFER",
        message:
          "Transfer legs can only be changed through the transfer resource.",
      });
    if (transaction.status === "VOIDED")
      throw new UnprocessableEntityException({
        code: "TRANSACTION_ALREADY_VOIDED",
      });
    if (this.enabled() && this.persistent) {
      const updated = await this.persistent.voidIfActive(transaction);
      if (!updated)
        throw new UnprocessableEntityException({ code: "TRANSACTION_ALREADY_VOIDED" });
      return this.view(updated);
    }
    if (
      transaction.type === "INCOME" &&
      this.store.accountBalance(transaction.accountId) - transaction.amountMinor < 0n
    ) {
      throw new UnprocessableEntityException({ code: "INSUFFICIENT_FUNDS" });
    }
    transaction.status = "VOIDED";
    transaction.updatedAt = new Date().toISOString();
    return this.view(transaction);
  }

  private owned(userId: string, id: string): TransactionRecord {
    const transaction = this.store.transactions.get(id);
    if (!transaction || transaction.userId !== userId)
      throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    return transaction;
  }
  private account(userId: string, id: string): AccountRecord {
    const account = this.store.accounts.get(id);
    if (!account || account.userId !== userId)
      throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    return account;
  }
  private category(userId: string, id: string): CategoryRecord {
    const category = this.store.categories.get(id);
    if (!category || (category.userId !== null && category.userId !== userId))
      throw new NotFoundException({ code: "CATEGORY_NOT_FOUND" });
    return category;
  }
  private async persistentCategory(
    userId: string,
    id: string,
  ): Promise<CategoryRecord> {
    const category = this.categories
      ? await this.categories.findForUser(userId, id)
      : (this.store.categories.get(id) ?? null);
    if (!category || (category.userId !== null && category.userId !== userId))
      throw new NotFoundException({ code: "CATEGORY_NOT_FOUND" });
    return category;
  }
  /**
   * Public projection of a transaction row (the `TRANSACTION_API_FIELDS`
   * manifest in `@finora/contracts` and the `Transaction` OpenAPI model).
   *
   * Explicitly whitelisted instead of spread so persistence-only columns
   * (`idempotencyKey`, `payloadFingerprint`) can never leak into an HTTP
   * response: the client's idempotency key and its payload fingerprint stay
   * server-side. `transferDirection` is only emitted for TRANSFER legs, exactly
   * like the OpenAPI model documents it.
   */
  private view(transaction: TransactionRecord) {
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
      ...(transaction.transferDirection ? { transferDirection: transaction.transferDirection } : {}),
    };
  }
  private enabled(): boolean {
    return isPrismaPersistenceEnabled();
  }
}
