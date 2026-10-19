import { describe, expect, it } from "@jest/globals";
import { mockAdapter } from "../lib/api/mockAdapter";
import type { AuthResult } from "../lib/api/adapter";
import type { User } from "../types/contract";

/**
 * FINANCIAL ENGINE TESTS (Section 15 — Business Rules).
 * The mock adapter plays the Backend authority role, so the canonical money
 * rules are proven here: single base currency, BR-003 (expense requires
 * category), BR-004 (transfers carry no category), atomic transfer voiding,
 * idempotency, and budget/goal uniqueness constraints.
 */

let seq = 0;

async function newUser(baseCurrency = "USD"): Promise<{ user: User; token: string }> {
  seq++;
  const res = await mockAdapter.register({
    email: `engine-${Date.now()}-${seq}@finora.test`,
    password: "secret-pass-1",
    baseCurrency,
  });
  return res.data as AuthResult;
}

describe("Accounts — Single Base Currency rule (Section 7)", () => {
  it("adopts the user's immutable base currency on every account", async () => {
    const { user } = await newUser("EUR");
    const res = await mockAdapter.createAccount(user.id, {
      name: "Euro Wallet",
      type: "BANK",
      currencyCode: "EUR",
      openingBalanceMinor: "50000",
    });
    expect(res.data.currencyCode).toBe("EUR");
  });

  it("rejects currency divergence at the authority boundary", async () => {
    const { user } = await newUser("USD");
    await expect(
      mockAdapter.createAccount(user.id, {
        name: "GBP Account",
        type: "BANK",
        currencyCode: "GBP",
        openingBalanceMinor: "1000",
      }),
    ).rejects.toMatchObject({ error: { code: "INVALID_CURRENCY" } });
  });
});

describe("Transactions — BR-003 and balance recalculation", () => {
  it("rejects an expense without a category", async () => {
    const { user } = await newUser();
    const acc = (await mockAdapter.createAccount(user.id, { name: "Cash", type: "CASH", currencyCode: "USD", openingBalanceMinor: "10000" })).data;
    await expect(
      mockAdapter.createTransaction(user.id, {
        accountId: acc.id,
        type: "EXPENSE",
        amountMinor: "500",
        transactionDate: "2026-09-01",
      }, "missing-category"),
    ).rejects.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("applies income and expense to balances in minor units exactly", async () => {
    const { user } = await newUser();
    const acc = (await mockAdapter.createAccount(user.id, { name: "Bank", type: "BANK", currencyCode: "USD", openingBalanceMinor: "10000" })).data;
    const cats = (await mockAdapter.getCategories(user.id)).data;
    const salary = cats.find((c) => c.name === "Salary")!;
    const food = cats.find((c) => c.name === "Food")!;

    await mockAdapter.createTransaction(user.id, {
      accountId: acc.id,
      type: "INCOME",
      categoryId: salary.id,
      amountMinor: "250000",
      transactionDate: "2026-09-01",
      description: "Paycheck",
    }, "income-1");
    await mockAdapter.createTransaction(user.id, {
      accountId: acc.id,
      type: "EXPENSE",
      categoryId: food.id,
      amountMinor: "1234",
      transactionDate: "2026-09-02",
    }, "expense-1");

    const after = (await mockAdapter.getAccounts(user.id)).data.find((a) => a.id === acc.id)!;
    expect(after.balanceMinor).toBe("258766");
  });
});

describe("Transfers — atomic pair + BR-004", () => {
  it("moves value between accounts and stores no category on either leg", async () => {
    const { user } = await newUser();
    const src = (await mockAdapter.createAccount(user.id, { name: "From", type: "BANK", currencyCode: "USD", openingBalanceMinor: "100000" })).data;
    const dst = (await mockAdapter.createAccount(user.id, { name: "To", type: "SAVINGS", currencyCode: "USD", openingBalanceMinor: "0" })).data;

    const result = (
      await mockAdapter.createTransfer(user.id, {
        fromAccountId: src.id,
        toAccountId: dst.id,
        amountMinor: "40000",
        transactionDate: "2026-09-03",
      }, "transfer-1")
    ).data;

    expect(result.sourceTx.categoryId).toBeNull();
    expect(result.destinationTx.categoryId).toBeNull();

    const accounts = (await mockAdapter.getAccounts(user.id)).data;
    expect(accounts.find((a) => a.id === src.id)!.balanceMinor).toBe("60000");
    expect(accounts.find((a) => a.id === dst.id)!.balanceMinor).toBe("40000");
  });

  it("voiding one leg reverses BOTH legs atomically", async () => {
    const { user } = await newUser();
    const src = (await mockAdapter.createAccount(user.id, { name: "From", type: "BANK", currencyCode: "USD", openingBalanceMinor: "100000" })).data;
    const dst = (await mockAdapter.createAccount(user.id, { name: "To", type: "SAVINGS", currencyCode: "USD", openingBalanceMinor: "0" })).data;

    const result = (
      await mockAdapter.createTransfer(user.id, {
        fromAccountId: src.id,
        toAccountId: dst.id,
        amountMinor: "30000",
        transactionDate: "2026-09-03",
      }, "transfer-2")
    ).data;
    await mockAdapter.voidTransaction(user.id, result.sourceTx.id);

    const accounts = (await mockAdapter.getAccounts(user.id)).data;
    expect(accounts.find((a) => a.id === src.id)!.balanceMinor).toBe("100000");
    expect(accounts.find((a) => a.id === dst.id)!.balanceMinor).toBe("0");

    const dstTx = (await mockAdapter.getTransactions(user.id, { accountId: dst.id })).data.find(
      (tx) => tx.id === result.destinationTx.id,
    )!;
    expect(dstTx.status).toBe("VOIDED");
  });

  it("rejects same-account transfers", async () => {
    const { user } = await newUser();
    const acc = (await mockAdapter.createAccount(user.id, { name: "Only", type: "BANK", currencyCode: "USD", openingBalanceMinor: "1000" })).data;
    await expect(
      mockAdapter.createTransfer(user.id, { fromAccountId: acc.id, toAccountId: acc.id, amountMinor: "100", transactionDate: "2026-09-03" }, "same-account"),
    ).rejects.toMatchObject({ error: { code: "SAME_ACCOUNT_TRANSFER" } });
  });

  it("replays an identical idempotent transfer and rejects a changed payload", async () => {
    const { user } = await newUser();
    const src = (await mockAdapter.createAccount(user.id, { name: "From", type: "BANK", currencyCode: "USD", openingBalanceMinor: "1000" })).data;
    const dst = (await mockAdapter.createAccount(user.id, { name: "To", type: "SAVINGS", currencyCode: "USD", openingBalanceMinor: "0" })).data;
    const key = "transfer-idem-parity";
    const payload = { fromAccountId: src.id, toAccountId: dst.id, amountMinor: "100", transactionDate: "2026-09-03" };
    const first = await mockAdapter.createTransfer(user.id, payload, key);
    const replay = await mockAdapter.createTransfer(user.id, payload, key);
    expect(replay.data.transfer.id).toBe(first.data.transfer.id);
    await expect(mockAdapter.createTransfer(user.id, { ...payload, amountMinor: "101" }, key))
      .rejects.toMatchObject({ error: { code: "DUPLICATE_REQUEST" } });
  });
});

describe("Idempotency — duplicate submits collapse to one transaction", () => {
  it("returns the original transaction for a repeated key", async () => {
    const { user } = await newUser();
    const acc = (await mockAdapter.createAccount(user.id, { name: "Bank", type: "BANK", currencyCode: "USD", openingBalanceMinor: "50000" })).data;
    const cats = (await mockAdapter.getCategories(user.id)).data;
    const food = cats.find((c) => c.name === "Food")!;

    const key = "idem-key-1";
    const payload = { accountId: acc.id, type: "EXPENSE" as const, categoryId: food.id, amountMinor: "999", transactionDate: "2026-09-03" };
    const first = (await mockAdapter.createTransaction(user.id, payload, key)).data;
    const second = (await mockAdapter.createTransaction(user.id, payload, key)).data;

    expect(second.id).toBe(first.id);
    const all = (await mockAdapter.getTransactions(user.id)).data;
    expect(all.filter((tx) => tx.id === first.id)).toHaveLength(1);
  });
});

describe("Budgets and Savings Goals — uniqueness + 1:1 rule", () => {
  it("rejects a duplicate budget for the same category and month", async () => {
    const { user } = await newUser();
    const cats = (await mockAdapter.getCategories(user.id)).data;
    const food = cats.find((c) => c.name === "Food")!;
    await mockAdapter.createBudget(user.id, { categoryId: food.id, year: 2026, month: 9, limitMinor: "100000" });
    await expect(
      mockAdapter.createBudget(user.id, { categoryId: food.id, year: 2026, month: 9, limitMinor: "200000" }),
    ).rejects.toMatchObject({ error: { code: "BUDGET_ALREADY_EXISTS" } });
  });

  it("caps exceeded budget percentages without losing large-value precision", async () => {
    const { user } = await newUser();
    const account = (await mockAdapter.createAccount(user.id, {
      name: "Large Balance",
      type: "BANK",
      currencyCode: "USD",
      openingBalanceMinor: "3000000000000000000",
    })).data;
    const food = (await mockAdapter.getCategories(user.id)).data.find((c) => c.name === "Food")!;
    const now = new Date();
    await mockAdapter.createBudget(user.id, {
      categoryId: food.id,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      limitMinor: "1000000000000000000",
    });
    await mockAdapter.createTransaction(user.id, {
      accountId: account.id,
      type: "EXPENSE",
      categoryId: food.id,
      amountMinor: "2000000000000000000",
      transactionDate: now.toISOString().slice(0, 10),
    }, "large-expense");

    const summary = (await mockAdapter.getDashboardSummary(user.id)).data;
    const budget = summary.budgets.find((entry) => entry.categoryId === food.id)!;
    expect(budget.spentMinor).toBe("2000000000000000000");
    expect(budget.percentage).toBe(100);
    expect(budget.isExceeded).toBe(true);
  });

  it("links goals only to SAVINGS accounts (1:1)", async () => {
    const { user } = await newUser();
    const bank = (await mockAdapter.createAccount(user.id, { name: "Bank", type: "BANK", currencyCode: "USD", openingBalanceMinor: "0" })).data;
    await expect(
      mockAdapter.createSavingsGoal(user.id, { accountId: bank.id, name: "Trip", targetAmountMinor: "100000" }),
    ).rejects.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("derives goal progress from the backend account balance", async () => {
    const { user } = await newUser();
    const savings = (await mockAdapter.createAccount(user.id, { name: "Vault", type: "SAVINGS", currencyCode: "USD", openingBalanceMinor: "50000" })).data;
    await mockAdapter.createSavingsGoal(user.id, { accountId: savings.id, name: "Safety Net", targetAmountMinor: "100000" });
    // Enrichment (currentAmountMinor / progressPercentage) is computed by the
    // authority when goals are listed — never cached on the write response.
    const listed = (await mockAdapter.getSavingsGoals(user.id)).data;
    const goal = listed.find((g) => g.accountId === savings.id)!;
    expect(goal.currentAmountMinor).toBe("50000");
    expect(goal.progressPercentage).toBe(50);
  });
});

describe("Resilience simulation (mock-only controls)", () => {
  it("reports NETWORK_ERROR when offline, then recovers", async () => {
    const engine = mockAdapter as unknown as { setNetworkOffline: (v: boolean) => void };
    const { user } = await newUser();
    engine.setNetworkOffline(true);
    await expect(mockAdapter.getAccounts(user.id)).rejects.toMatchObject({ error: { code: "NETWORK_ERROR" } });
    engine.setNetworkOffline(false);
    await expect(mockAdapter.getAccounts(user.id)).resolves.toHaveProperty("data");
  });
});
