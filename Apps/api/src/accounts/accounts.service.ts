import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AccountRecord, AccountType, InMemoryStore } from "../core/store";
import { fromMinor, toSafeMinor, MoneyInput } from "../core/money";
import { PageRequest, toPageInMemory } from "../core/pagination";
import { PrismaAccountRepository } from "../database/repositories/prisma-account.repository";
import { isSupportedCurrency } from "@finora/contracts";
import { isPrismaPersistenceEnabled } from "../config/persistence";

@Injectable()
export class AccountsService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly persistent: PrismaAccountRepository,
  ) {}

  async list(userId: string) {
    if (this.persistenceEnabled()) {
      const result = await this.persistent.listForUser(userId, undefined);
      const balances = await this.persistent.balancesForUser(userId);
      return Promise.all(
        result.data.map((account) =>
          this.viewPersistent(account, balances.get(account.id)),
        ),
      );
    }
    return [...this.store.accounts.values()]
      .filter((account) => account.userId === userId)
      .map((account) => this.view(account));
  }

  /** Paginated public listing for GET /accounts (F-018 keyset contract). */
  async listPaged(userId: string, page?: PageRequest) {
    const request = page ?? {};
    if (this.persistenceEnabled()) {
      const [result, balances] = await Promise.all([
        this.persistent.listForUser(userId, request),
        this.persistent.balancesForUser(userId),
      ]);
      return {
        data: await Promise.all(
          result.data.map((account) =>
            this.viewPersistent(account, balances.get(account.id)),
          ),
        ),
        nextCursor: result.nextCursor,
      };
    }
    const paged = toPageInMemory(
      [...this.store.accounts.values()].filter(
        (account) => account.userId === userId,
      ),
      request,
    );
    return {
      data: paged.data.map((account) => this.view(account)),
      nextCursor: paged.nextCursor,
    };
  }

  /** Backwards-compatible unbounded read for internal callers: dashboard/tests. */

  async create(
    userId: string,
    input: {
      name: string;
      type: AccountType;
      currencyCode: string;
      openingBalanceMinor: MoneyInput;
    },
  ) {
    const currencyCode = input.currencyCode.toUpperCase();
    if (!isSupportedCurrency(currencyCode))
      throw new UnprocessableEntityException({ code: "INVALID_CURRENCY" });
    if (typeof input.openingBalanceMinor === "number" && input.openingBalanceMinor < 0)
      throw new UnprocessableEntityException({
        code: "INVALID_OPENING_BALANCE",
      });
    const userCurrency = this.store.users.get(userId)?.baseCurrency ??
      (this.persistenceEnabled()
        ? await this.persistent.findUserBaseCurrency(userId)
        : null);
    if (userCurrency && currencyCode !== userCurrency.toUpperCase())
      throw new UnprocessableEntityException({ code: "BASE_CURRENCY_MISMATCH" });
    // Q-001: the opening balance is stored as BIGINT and must round-trip as JSON.
    const openingBalanceMinor = toSafeMinor(
      input.openingBalanceMinor,
      "openingBalanceMinor",
    );
    const account: AccountRecord = {
      id: this.store.id(),
      userId,
      name: input.name.trim(),
      type: input.type,
      currencyCode,
      openingBalanceMinor,
      status: "ACTIVE",
    };
    if (this.persistenceEnabled())
      return this.viewPersistent(await this.persistent.create(account));
    this.store.accounts.set(account.id, account);
    return this.view(account);
  }

  async get(userId: string, id: string) {
    if (this.persistenceEnabled()) {
      const account = await this.persistent.findByIdForUser(userId, id);
      if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
      return this.viewPersistent(account);
    }
    return this.view(this.owned(userId, id));
  }

  async update(userId: string, id: string, name?: string) {
    if (this.persistenceEnabled()) {
      const account = await this.persistent.findByIdForUser(userId, id);
      if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
      if (name === undefined) return this.viewPersistent(account);
      const updated = await this.persistent.updateName(userId, id, name.trim());
      if (!updated) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
      return this.viewPersistent(updated);
    }
    const account = this.owned(userId, id);
    if (name !== undefined) account.name = name.trim();
    return this.view(account);
  }

  async archive(userId: string, id: string) {
    if (this.persistenceEnabled()) {
      const archived = await this.persistent.archiveIfActive(userId, id);
      if (!archived) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
      return this.viewPersistent(archived);
    }
    const account = this.owned(userId, id);
    if ([...this.store.goals.values()].some(
      (goal) => goal.userId === userId && goal.accountId === id && goal.status === "ACTIVE",
    )) {
      throw new UnprocessableEntityException({
        code: "ACCOUNT_HAS_ACTIVE_GOAL",
        message: "An account with an active savings goal cannot be archived.",
      });
    }
    account.status = "ARCHIVED";
    return this.view(account);
  }

  owned(userId: string, id: string): AccountRecord {
    const account = this.store.accounts.get(id);
    if (!account || account.userId !== userId)
      throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    return account;
  }

  private view(account: AccountRecord) {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currencyCode: account.currencyCode,
      status: account.status,
      openingBalanceMinor: fromMinor(account.openingBalanceMinor),
      balanceMinor: fromMinor(this.store.accountBalance(account.id)),
    };
  }

  private async viewPersistent(account: AccountRecord, balanceOverride?: bigint) {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currencyCode: account.currencyCode,
      status: account.status,
      openingBalanceMinor: fromMinor(account.openingBalanceMinor),
      balanceMinor: fromMinor(balanceOverride ?? (await this.persistent.balance(account.id))),
    };
  }

  private persistenceEnabled(): boolean {
    return isPrismaPersistenceEnabled();
  }
}
