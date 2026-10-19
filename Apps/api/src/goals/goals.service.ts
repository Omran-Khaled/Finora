import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { GoalRecord, InMemoryStore } from "../core/store";
import { fromMinor, minorPercentage, toSafeMinor, MoneyInput } from "../core/money";
import { PageRequest, toPageInMemory } from "../core/pagination";
import { PrismaGoalRepository } from "../database/repositories/goal.repository";
import { PrismaAccountRepository } from "../database/repositories/prisma-account.repository";
import { isPrismaPersistenceEnabled } from "../config/persistence";
@Injectable()
export class GoalsService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly persistent: PrismaGoalRepository,
    private readonly accounts?: PrismaAccountRepository,
  ) {}
  async list(userId: string) {
    return isPrismaPersistenceEnabled()
      ? Promise.all(
          (await this.persistent.list(userId)).data.map((item) =>
            this.view(item),
          ),
        )
      : Promise.all(
          [...this.store.goals.values()]
            .filter((item) => item.userId === userId)
            .map((item) => this.view(item)),
        );
  }
  /** Paginated public listing for GET /savings-goals (F-018 keyset contract). */
  async listPaged(userId: string, page?: PageRequest) {
    const request = page ?? {};
    if (isPrismaPersistenceEnabled()) {
      const result = await this.persistent.list(userId, request);
      return {
        data: await Promise.all(result.data.map((item) => this.view(item))),
        nextCursor: result.nextCursor,
      };
    }
    const rows = [...this.store.goals.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const paged = toPageInMemory(rows, request);
    return {
      data: await Promise.all(paged.data.map((item) => this.view(item))),
      nextCursor: paged.nextCursor,
    };
  }
  async create(
    userId: string,
    input: {
      accountId: string;
      name: string;
      targetAmountMinor: MoneyInput;
      targetDate?: string;
    },
  ) {
    const persistentMode = isPrismaPersistenceEnabled();
    const account =
      persistentMode && this.accounts
        ? await this.accounts.findByIdForUser(userId, input.accountId)
        : this.store.accounts.get(input.accountId);
    if (!account || account.userId !== userId)
      throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    if (account.status === "ARCHIVED")
      throw new UnprocessableEntityException({ code: "ACCOUNT_ARCHIVED" });
    if (account.type !== "SAVINGS")
      throw new UnprocessableEntityException({
        code: "VALIDATION_ERROR",
        message: "A goal requires an unused SAVINGS account.",
      });
    // One goal per account (SavingsGoal.accountId is unique). Prisma mode must read the
    // persistent rows — reading the in-memory store would let a duplicate reach the DB.
    const alreadyLinked = persistentMode
      ? await this.persistent.existsForAccount(userId, account.id)
      : [...this.store.goals.values()].some(
          (item) => item.accountId === account.id,
        );
    if (alreadyLinked)
      throw new UnprocessableEntityException({
        code: "VALIDATION_ERROR",
        message: "A goal requires an unused SAVINGS account.",
      });
    const goal: GoalRecord = {
      id: this.store.id(),
      userId,
      accountId: account.id,
      name: input.name.trim(),
      targetAmountMinor: toSafeMinor(input.targetAmountMinor, "targetAmountMinor"),
      targetDate: input.targetDate ?? null,
      status: "ACTIVE",
    };
    if (persistentMode) return this.view(await this.persistent.create(goal));
    this.store.goals.set(goal.id, goal);
    return this.view(goal);
  }
  async get(userId: string, id: string) {
    return this.view(
      isPrismaPersistenceEnabled()
        ? await this.persistent.find(userId, id).then((goal) => {
            if (!goal) throw new NotFoundException({ code: "GOAL_NOT_FOUND" });
            return goal;
          })
        : this.owned(userId, id),
    );
  }
  async update(userId: string, id: string, name: string) {
    if (isPrismaPersistenceEnabled()) {
      const goal = await this.persistent.find(userId, id);
      if (!goal) throw new NotFoundException({ code: "GOAL_NOT_FOUND" });
      if (goal.status === "ARCHIVED") throw new UnprocessableEntityException({ code: "VALIDATION_ERROR", message: "An archived goal cannot be updated." });
      const updated = await this.persistent.updateName(userId, id, name.trim());
      if (!updated) throw new NotFoundException({ code: "GOAL_NOT_FOUND" });
      return this.view(updated);
    }
    const goal = this.owned(userId, id);
    goal.name = name.trim();
    return this.view(goal);
  }
  async archive(userId: string, id: string) {
    if (isPrismaPersistenceEnabled()) {
      const archived = await this.persistent.archiveIfActive(userId, id);
      if (!archived) throw new NotFoundException({ code: "GOAL_NOT_FOUND" });
      return this.view(archived);
    }
    const goal = this.owned(userId, id);
    goal.status = "ARCHIVED";
    return this.view(goal);
  }
  private owned(userId: string, id: string) {
    const goal = this.store.goals.get(id);
    if (!goal || goal.userId !== userId)
      throw new NotFoundException({ code: "GOAL_NOT_FOUND" });
    return goal;
  }
  private async view(goal: GoalRecord) {
    const persistentMode = isPrismaPersistenceEnabled();
    const balance =
      persistentMode && this.accounts
        ? await this.accounts.balance(goal.accountId)
        : this.store.accountBalance(goal.accountId);
    const progress = minorPercentage(balance, goal.targetAmountMinor, 100n);
    const account =
      persistentMode && this.accounts
        ? await this.accounts.findByIdForUser(goal.userId, goal.accountId)
        : this.store.accounts.get(goal.accountId);
    if (goal.status === "ACTIVE" && progress >= 100) {
      // Persist the transition atomically. If an archive wins the race first,
      // completeIfActive returns null and we re-read the authoritative row so the
      // response never claims COMPLETED while PostgreSQL says ARCHIVED.
      if (persistentMode) {
        const completed = await this.persistent.completeIfActive(goal.userId, goal.id);
        if (completed) {
          Object.assign(goal, completed);
        } else {
          const current = await this.persistent.find(goal.userId, goal.id);
          if (current) Object.assign(goal, current);
        }
      } else {
        goal.status = "COMPLETED";
      }
    }
    const payload = {
      ...goal,
      targetAmountMinor: fromMinor(goal.targetAmountMinor),
      currentAmountMinor: fromMinor(balance),
      currentBalanceMinor: fromMinor(balance),
      progressPercent: progress,
      progressPercentage: progress,
      accountId: goal.accountId,
      accountName: account?.name ?? "Savings Goal",
      name: goal.name,
    };
    return payload;
  }
}
