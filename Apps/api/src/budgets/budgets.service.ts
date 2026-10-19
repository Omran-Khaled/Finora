import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { BudgetRecord, InMemoryStore } from "../core/store";
import { fromMinor, minorPercentage, toSafeMinor, MoneyInput } from "../core/money";
import { PageRequest, toPageInMemory } from "../core/pagination";
import { monthWindow } from "../core/period";
import { PrismaBudgetRepository } from "../database/repositories/budget.repository";
import { PrismaTransactionRepository } from "../database/repositories/transaction.repository";
import { PrismaCategoryRepository } from "../database/repositories/category.repository";
import { isPrismaPersistenceEnabled } from "../config/persistence";

@Injectable()
export class BudgetsService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly persistent: PrismaBudgetRepository,
    private readonly transactions?: PrismaTransactionRepository,
    private readonly categories?: PrismaCategoryRepository,
  ) {}
  /** Unbounded read for internal aggregate queries (dashboard/duplicate guards). */
  async list(userId: string) {
    if (isPrismaPersistenceEnabled()) {
      const result = await this.persistent.list(userId, undefined);
      return Promise.all(result.data.map((item) => this.view(item)));
    }
    return Promise.all(
      [...this.store.budgets.values()]
        .filter((item) => item.userId === userId)
        .map((item) => this.view(item)),
    );
  }

  /** Paginated public listing for GET /budgets (F-018 keyset contract). */
  async listPaged(userId: string, page?: PageRequest) {
    const request = page ?? {};
    if (isPrismaPersistenceEnabled()) {
      const result = await this.persistent.list(userId, request);
      return {
        data: await Promise.all(result.data.map((item) => this.view(item))),
        nextCursor: result.nextCursor,
      };
    }
    const budgets = [...this.store.budgets.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const paged = toPageInMemory(budgets, request);
    return {
      data: await Promise.all(paged.data.map((item) => this.view(item))),
      nextCursor: paged.nextCursor,
    };
  }
  async create(
    userId: string,
    input: {
      categoryId: string;
      year: number;
      month: number;
      limitMinor: MoneyInput;
    },
  ) {
    const persistentMode = isPrismaPersistenceEnabled();
    const category = this.store.categories.get(input.categoryId);
    const persistentCategory =
      persistentMode && this.categories
        ? await this.categories.findForUser(userId, input.categoryId)
        : category;
    if (
      !persistentCategory ||
      (persistentCategory.userId !== null &&
        persistentCategory.userId !== userId)
    )
      throw new NotFoundException({ code: "CATEGORY_NOT_FOUND" });
    if (persistentCategory.type !== "EXPENSE" || persistentCategory.status !== "ACTIVE")
      throw new UnprocessableEntityException({
        code: "VALIDATION_ERROR",
        message: "A budget requires an active EXPENSE category.",
      });
    // One budget per (category, year, month). Prisma mode must read the persistent
    // rows: the in-memory store is empty there, so a duplicate would reach the DB
    // and surface as a raw unique-constraint failure instead of a clean 409.
    const duplicate = persistentMode
      ? await this.persistent.existsForPeriod(
          userId,
          input.categoryId,
          input.year,
          input.month,
        )
      : [...this.store.budgets.values()].some(
          (item) =>
            item.userId === userId &&
            item.categoryId === input.categoryId &&
            item.year === input.year &&
            item.month === input.month,
        );
    if (duplicate)
      throw new ConflictException({ code: "BUDGET_ALREADY_EXISTS" });
    const budget: BudgetRecord = {
      id: this.store.id(),
      userId,
      categoryId: input.categoryId,
      year: input.year,
      month: input.month,
      limitMinor: toSafeMinor(input.limitMinor, "limitMinor"),
    };
    if (persistentMode) return this.view(await this.persistent.create(budget));
    this.store.budgets.set(budget.id, budget);
    return this.view(budget);
  }
  async update(userId: string, id: string,   limitMinor: MoneyInput) {
    if (isPrismaPersistenceEnabled()) {
      const budget = await this.persistent.find(userId, id);
      if (!budget) throw new NotFoundException({ code: "BUDGET_NOT_FOUND" });
      budget.limitMinor = toSafeMinor(limitMinor, "limitMinor");
      return this.view(await this.persistent.save(budget));
    }
    const budget = this.owned(userId, id);
    budget.limitMinor = toSafeMinor(limitMinor, "limitMinor");
    return this.view(budget);
  }
  async remove(userId: string, id: string) {
    if (isPrismaPersistenceEnabled()) {
      const budget = await this.persistent.find(userId, id);
      if (!budget) throw new NotFoundException({ code: "BUDGET_NOT_FOUND" });
      await this.persistent.remove(budget);
      return;
    }
    this.store.budgets.delete(this.owned(userId, id).id);
  }
  owned(userId: string, id: string) {
    const budget = this.store.budgets.get(id);
    if (!budget || budget.userId !== userId)
      throw new NotFoundException({ code: "BUDGET_NOT_FOUND" });
    return budget;
  }
  private async view(budget: BudgetRecord) {
    // F-019: the real last day of the month — `${prefix}-31` rolls over into the
    // next month for February and the 30-day months.
    const { prefix, from, to } = monthWindow(budget.year, budget.month);
    const spent = isPrismaPersistenceEnabled() && this.transactions
      ? await this.transactions.activeExpenseTotalForCategory(
          budget.userId,
          budget.categoryId,
          from,
          to,
        )
      : [...this.store.transactions.values()]
          .filter(
            (item) =>
              item.userId === budget.userId &&
              item.categoryId === budget.categoryId &&
              item.type === "EXPENSE" &&
              item.status === "ACTIVE" &&
              item.transactionDate.startsWith(prefix),
          )
          .reduce((sum, item) => sum + item.amountMinor, 0n);
    const percentage = minorPercentage(spent, budget.limitMinor);
    const progressPercent = percentage;
    const exceeded = spent > budget.limitMinor;
    const isExceeded = exceeded;
    return { id: budget.id, categoryId: budget.categoryId, year: budget.year, month: budget.month, limitMinor: fromMinor(budget.limitMinor), spentMinor: fromMinor(spent), remainingMinor: fromMinor(budget.limitMinor - spent), percentage, isExceeded, progressPercent, exceeded, usagePercentage: percentage };
  }
}
