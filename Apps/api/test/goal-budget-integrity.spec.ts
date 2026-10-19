import {
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InMemoryStore } from "../src/core/store";
import { BudgetsService } from "../src/budgets/budgets.service";
import { GoalsService } from "../src/goals/goals.service";
import { PrismaAccountRepository } from "../src/database/repositories/prisma-account.repository";
import { PrismaBudgetRepository } from "../src/database/repositories/budget.repository";
import { PrismaCategoryRepository } from "../src/database/repositories/category.repository";
import { PrismaGoalRepository } from "../src/database/repositories/goal.repository";
import { PrismaTransactionRepository } from "../src/database/repositories/transaction.repository";
import { PrismaService } from "../src/database/prisma.service";

const USER = "user-1";

const savingsAccount = {
  id: "sav",
  userId: USER,
  name: "Savings",
  type: "SAVINGS" as const,
  currencyCode: "USD",
  openingBalanceMinor: 0n,
  status: "ACTIVE" as const,
};

function accountRepo(balance: bigint): PrismaAccountRepository {
  return {
    findByIdForUser: async () => ({ ...savingsAccount }),
    listForUser: async () => ({ data: [{ ...savingsAccount }], nextCursor: null }),
    balance: async () => balance,
  } as unknown as PrismaAccountRepository;
}

describe("G-001 (memory mode) — behavior preserved", () => {
  beforeEach(() => {
    delete process.env.ENABLE_PRISMA;
  });
  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  it("marks a goal COMPLETED in the store when the linked balance reaches the target", async () => {
    const store = new InMemoryStore();
    store.accounts.set("sav", { ...savingsAccount });
    store.goals.set("g1", {
      id: "g1",
      userId: USER,
      accountId: "sav",
      name: "Laptop",
      targetAmountMinor: 300n,
      targetDate: null,
      status: "ACTIVE",
    });
    const goals = new GoalsService(
      store,
      {} as PrismaGoalRepository,
      undefined,
    );

    // The linked account already holds the target amount.
    store.transactions.set("t1", {
      id: "t1",
      userId: USER,
      accountId: "sav",
      categoryId: null,
      type: "INCOME",
      amountMinor: 300n,
      currencyCode: "USD",
      description: null,
      transactionDate: "2026-08-01",
      status: "ACTIVE",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });

    const view = await goals.get(USER, "g1");

    expect(view.status).toBe("COMPLETED");
    expect(store.goals.get("g1")?.status).toBe("COMPLETED");
  });

  it("rejects a duplicate budget with 409", async () => {
    const store = new InMemoryStore();
    store.categories.set("cat-1", {
      id: "cat-1",
      userId: null,
      name: "Food",
      type: "EXPENSE",
      isSystem: true,
      status: "ACTIVE",
    });
    store.budgets.set("b1", {
      id: "b1",
      userId: USER,
      categoryId: "cat-1",
      year: 2026,
      month: 8,
      limitMinor: 1000n,
    });
    const budgets = new BudgetsService(store, {} as PrismaBudgetRepository);

    await expect(
      budgets.create(USER, {
        categoryId: "cat-1",
        year: 2026,
        month: 8,
        limitMinor: '500',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a second goal on the same account with 422", async () => {
    const store = new InMemoryStore();
    store.accounts.set("sav", { ...savingsAccount });
    store.goals.set("g1", {
      id: "g1",
      userId: USER,
      accountId: "sav",
      name: "Laptop",
      targetAmountMinor: 300n,
      targetDate: null,
      status: "ACTIVE",
    });
    const goals = new GoalsService(
      store,
      {} as PrismaGoalRepository,
      undefined,
    );

    await expect(
      goals.create(USER, {
        accountId: "sav",
        name: "Second",
        targetAmountMinor: '100',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
describe("G-001 (prisma mode) — persistent guards", () => {
  beforeEach(() => {
    process.env.ENABLE_PRISMA = "true";
  });

  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  it("persists the COMPLETED transition of a goal that reached its target", async () => {
    const saved: Array<{ id: string; status: string }> = [];
    const goals = {
      find: async () => ({
        id: "g1",
        userId: USER,
        accountId: "sav",
        name: "Laptop",
        targetAmountMinor: 300n,
        targetDate: null,
        status: "ACTIVE" as const,
      }),
      completeIfActive: async (_userId: string, goalId: string) => {
        const completed = {
          id: goalId,
          userId: USER,
          accountId: "sav",
          name: "Laptop",
          targetAmountMinor: 300n,
          targetDate: null,
          status: "COMPLETED" as const,
        };
        saved.push({ id: completed.id, status: completed.status });
        return completed;
      },
    } as unknown as PrismaGoalRepository;

    const service = new GoalsService(
      new InMemoryStore(),
      goals,
      accountRepo(300n),
    );
    const view = await service.get(USER, "g1");

    expect(view.status).toBe("COMPLETED");
    expect(saved).toEqual([{ id: "g1", status: "COMPLETED" }]);
  });

  it("does not persist anything while a goal is below its target", async () => {
    const saved: unknown[] = [];
    const goals = {
      find: async () => ({
        id: "g1",
        userId: USER,
        accountId: "sav",
        name: "Laptop",
        targetAmountMinor: 300n,
        targetDate: null,
        status: "ACTIVE" as const,
      }),
      completeIfActive: async () => null,
    } as unknown as PrismaGoalRepository;

    const service = new GoalsService(
      new InMemoryStore(),
      goals,
      accountRepo(150n),
    );

    expect((await service.get(USER, "g1")).status).toBe("ACTIVE");
    expect(saved).toEqual([]);
  });

  it("rejects a duplicate budget found by the persistent existence query (409, no insert)", async () => {
    const created: unknown[] = [];
    const budgets = {
      existsForPeriod: async () => true,
      create: async (budget: unknown) => {
        created.push(budget);
        return budget;
      },
    } as unknown as PrismaBudgetRepository;
    const categories = {
      findForUser: async () => ({
        id: "cat-1",
        userId: null,
        name: "Food",
        // R-009: the service requires an active EXPENSE category, so the fixture must carry `type`.
        type: "EXPENSE",
        isSystem: true,
        status: "ACTIVE",
      }),
    } as unknown as PrismaCategoryRepository;

    const service = new BudgetsService(
      new InMemoryStore(),
      budgets,
      undefined,
      categories,
    );
    await expect(
      service.create(USER, {
        categoryId: "cat-1",
        year: 2026,
        month: 8,
        limitMinor: '500',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(created).toHaveLength(0);
  });

  it("rejects a second goal found by the persistent existence query (422, no insert)", async () => {
    const created: unknown[] = [];
    const goals = {
      existsForAccount: async () => true,
      create: async (goal: unknown) => {
        created.push(goal);
        return goal;
      },
    } as unknown as PrismaGoalRepository;

    const service = new GoalsService(
      new InMemoryStore(),
      goals,
      accountRepo(0n),
    );
    await expect(
      service.create(USER, {
        accountId: "sav",
        name: "Second",
        targetAmountMinor: '100',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(created).toHaveLength(0);
  });

  it("uses the database aggregate and calendar-month bounds for budget views", async () => {
    const aggregate = jest.fn().mockResolvedValue(123n);
    const transactions = {
      activeExpenseTotalForCategory: aggregate,
      list: jest.fn(),
    } as unknown as PrismaTransactionRepository;
    const budgets = {
      list: async () => ({
        data: [
          {
            id: "b1",
            userId: USER,
            categoryId: "cat-1",
            year: 2026,
            month: 2,
            limitMinor: 500n,
          },
        ],
        nextCursor: null,
      }),
    } as unknown as PrismaBudgetRepository;

    const result = await new BudgetsService(
      new InMemoryStore(),
      budgets,
      transactions,
    ).list(USER);

    expect(aggregate).toHaveBeenCalledWith(
      USER,
      "cat-1",
      "2026-02-01",
      "2026-02-28",
    );
    expect(transactions.list).not.toHaveBeenCalled();
    expect(result[0]?.spentMinor).toBe("123");
  });

  it("keeps database aggregate totals exact beyond the signed BIGINT limit", async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValue([{ totalMinor: "9223372036854775808" }]);
    const prisma = {
      db: { $queryRaw: queryRaw },
    } as unknown as PrismaService;
    const transactions = new PrismaTransactionRepository(prisma);

    await expect(
      transactions.activeExpenseTotalForCategory(
        USER,
        "cat-1",
        "2026-02-01",
        "2026-02-28",
      ),
    ).resolves.toBe(9223372036854775808n);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
