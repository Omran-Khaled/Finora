import { HttpException } from "@nestjs/common";
import { AuthService } from "../src/auth/auth.service";
import { InMemoryStore } from "../src/core/store";
import { TransactionsService } from "../src/transactions/transactions.service";
import { PrismaAuthRepository } from "../src/auth/auth.repository";

describe("release hardening", () => {
  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  it("rejects unsupported currencies at the backend authority", async () => {
    const store = new InMemoryStore();
    const repository = {
      findUserByEmail: async () => null,
      createUser: async () => { throw new Error("should not persist invalid currency"); },
    } as unknown as PrismaAuthRepository;
    const service = new AuthService(store, repository);

    await expect(service.register("user@example.com", "password123", "ZZZ"))
      .rejects.toBeInstanceOf(HttpException);
    expect(store.users.size).toBe(0);
  });

  it("does not leave an in-memory user when persistent user creation fails", async () => {
    process.env.ENABLE_PRISMA = "true";
    const store = new InMemoryStore();
    const repository = {
      findUserByEmail: async () => null,
      createUser: async () => { throw new Error("database unavailable"); },
    } as unknown as PrismaAuthRepository;
    const service = new AuthService(store, repository);

    await expect(service.register("user@example.com", "password123", "USD"))
      .rejects.toThrow("database unavailable");
    expect(store.users.size).toBe(0);
    expect(store.sessions.size).toBe(0);
  });

  it("rejects a category whose semantic type does not match the transaction type", async () => {
    const store = new InMemoryStore();
    const service = new TransactionsService(store);
    const userId = store.id();
    const accountId = store.id();
    store.accounts.set(accountId, {
      id: accountId,
      userId,
      name: "Main",
      type: "BANK",
      currencyCode: "USD",
      openingBalanceMinor: 10000n,
      status: "ACTIVE",
    });
    const categoryId = store.id();
    store.categories.set(categoryId, {
      id: categoryId,
      userId: null,
      name: "Salary",
      type: "INCOME",
      isSystem: true,
      status: "ACTIVE",
    });

    await expect(service.create(userId, {
      type: "EXPENSE",
      accountId,
      categoryId,
      amountMinor: "100",
      transactionDate: "2026-09-27",
    })).rejects.toMatchObject({ response: { code: "INVALID_CATEGORY_TYPE" } });
  });
});
