import { UnprocessableEntityException } from "@nestjs/common";
import { AccountsService } from "../src/accounts/accounts.service";
import { InMemoryStore } from "../src/core/store";
import { PrismaAccountRepository } from "../src/database/repositories/prisma-account.repository";

describe("account archive integrity", () => {
  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  it("rejects archiving a savings account that still has an active goal", async () => {
    const store = new InMemoryStore();
    store.accounts.set("sav", {
      id: "sav",
      userId: "user-1",
      name: "Savings",
      type: "SAVINGS",
      currencyCode: "USD",
      openingBalanceMinor: 0n,
      status: "ACTIVE",
    });
    store.goals.set("goal-1", {
      id: "goal-1",
      userId: "user-1",
      accountId: "sav",
      name: "Emergency fund",
      targetAmountMinor: 1000n,
      targetDate: null,
      status: "ACTIVE",
    });

    const accounts = new AccountsService(store, {} as PrismaAccountRepository);

    await expect(accounts.archive("user-1", "sav")).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(store.accounts.get("sav")?.status).toBe("ACTIVE");
  });
});
