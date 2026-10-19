/**
 * MOCK API ADAPTER (Section 29).
 * An API-shaped, in-memory implementation of the Finora Financial Engine used
 * as the default client adapter. It simulates the Backend authority: balances,
 * budget usage, goal progress and currency rules are computed HERE — the client
 * NEVER computes domain truth locally.
 *
 * Replaceable by the Real HTTP Adapter without touching feature components
 * (switch via EXPO_PUBLIC_USE_REAL_API, see lib/api/apiClient.ts).
 *
 * Mock-only controls (offline / simulated failure / latency) are exposed for
 * resilience testing — they are NOT product features.
 *
 * Contract-alignment fixes live here because this adapter plays the Backend
 * authority role for the prototype:
 *  - Accounts always adopt the user's immutable base currency
 *    (currency divergence is rejected — Section 7 / Master Contract).
 *  - Category type is restricted to INCOME | EXPENSE (no third variant).
 */

import type {
  Account,
  AccountType,
  ApiCollectionResponse,
  ApiResponse,
  Budget,
  Category,
  CategoryType,
  CreateAccountRequest,
  CreateBudgetRequest,
  CreateCategoryRequest,
  CreateGoalRequest,
  CreateTransactionRequest,
  CreateTransferRequest,
  DashboardSummaryResponse,
  LoginRequest,
  RegisterRequest,
  SavingsGoal,
  Transaction,
  TransactionFilterParams,
  TransactionType,
  Transfer,
  UpdateAccountRequest,
  User
} from "../../types/contract";
import type { ApiAdapter, AuthResult, TransferCreationResult } from "./adapter";
import { createApiError } from "./errors";
import { isSupportedCurrency } from "@finora/contracts";
import { minorPercentage } from "../format";
import { collectAllPages, COLLECTION_PAGE_LIMIT, type PagedEnvelope } from "./pagination";

const DEMO_USER_ID = "usr_demo_finora";
function parseMinor(value: string): bigint {
  return BigInt(value);
}

function isPositiveMinor(value: string): boolean {
  return /^\d+$/.test(value) && parseMinor(value) > 0n;
}

function generateId(prefix: string = "id"): string {
  return prefix + "_" + Math.random().toString(36).substring(2, 10);
}

const DEFAULT_SYSTEM_CATEGORIES: readonly { name: string; type: CategoryType }[] = [
  { name: "Food", type: "EXPENSE" },
  { name: "Transport", type: "EXPENSE" },
  { name: "Bills", type: "EXPENSE" },
  { name: "Shopping", type: "EXPENSE" },
  { name: "Health", type: "EXPENSE" },
  { name: "Entertainment", type: "EXPENSE" },
  { name: "Education", type: "EXPENSE" },
  { name: "Salary", type: "INCOME" },
  { name: "Freelance", type: "INCOME" },
  { name: "Other", type: "EXPENSE" }
];

const CATEGORY_TYPES: readonly CategoryType[] = ["INCOME", "EXPENSE"];
const ACCOUNT_TYPES: readonly AccountType[] = ["CASH", "BANK", "SAVINGS"];

class MockEngine implements ApiAdapter {
  private users = new Map<string, User>();
  private passwords = new Map<string, string>();
  private accounts = new Map<string, Account>();
  private categories = new Map<string, Category>();
  private transactions = new Map<string, Transaction>();
  private transfers = new Map<string, Transfer>();
  private budgets = new Map<string, Budget>();
  private goals = new Map<string, SavingsGoal>();
  private idempotencyStore = new Map<string, unknown>();
  private transferIdempotency = new Map<string, {
    fingerprint: string;
    result: ApiResponse<TransferCreationResult>;
  }>();

  // Mock network simulation (test-only controls)
  private isOffline = false;
  private latencyMs = 250;
  private failNextNetwork = false;

  setNetworkOffline(offline: boolean): void {
    this.isOffline = offline;
  }

  setLatency(ms: number): void {
    this.latencyMs = Math.max(0, ms);
  }

  failNextRequest(): void {
    this.failNextNetwork = true;
  }

  setToken(_token: string | null): void {
    // Bearer concept: no-op for the in-memory adapter
  }

  async logout(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Session refresh (A-003). The mock engine keeps no server-side session, so it
   * issues a fresh token for the demo/registered identity — enough to exercise the
   * client's refresh-then-retry path without a real backend.
   */
  async refresh(): Promise<ApiResponse<AuthResult>> {
    return this.withSimulation(async () => {
      const user = this.users.get("usr_demo_finora") ?? Array.from(this.users.values())[0];
      if (!user) {
        throw createApiError("UNAUTHORIZED", "Your session has expired. Please sign in again.");
      }
      return { data: { user, token: "tok_" + generateId("session") } };
    });
  }


  // ------------------------------------------------------------------
  // Seeding
  // ------------------------------------------------------------------
  constructor() {
    this.seedSystemCategories();
    this.seedDemoUser();
  }

  private findCategoryByName(name: string): Category | undefined {
    return Array.from(this.categories.values()).find((category) => category.name === name);
  }

  private findAccountByName(name: string): Account | undefined {
    return Array.from(this.accounts.values()).find((account) => account.name === name);
  }

  /**
   * Session continuity for the in-memory mock (stale-session recovery).
   * The REAL backend persists users, but this mock loses its memory on every
   * app reload while the client session survives in Secure Storage. Without
   * this, a restored session would hit "User session is invalid" on the very
   * first write (createAccount) — e.g. pressing "Complete Setup & Enter Finora"
   * after a reload. Auto-provisioning the authenticated-but-unknown identity
   * keeps the mock consistent with every other method, which already accept
   * any well-formed userId.
   */
  private ensureUser(userId: string, preferredCurrency?: string): User {
    const existing = this.users.get(userId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const restored: User = {
      id: userId,
      email: "restored-" + userId + "@finora.mock",
      baseCurrency: (preferredCurrency || "USD").toUpperCase(),
      createdAt: now,
      updatedAt: now
    };
    this.users.set(userId, restored);
    return restored;
  }

  private seedSystemCategories(): void {
    DEFAULT_SYSTEM_CATEGORIES.forEach((category) => {
      const now = new Date().toISOString();
      const id = generateId("cat_sys");
      this.categories.set(id, {
        id,
        userId: null,
        name: category.name,
        type: category.type,
        isSystem: true,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now
      });
    });
  }

  private seedDemoUser(): void {
    const userId = DEMO_USER_ID;
    const now = new Date().toISOString();
    this.users.set(userId, {
      id: userId,
      email: "demo@finora.app",
      baseCurrency: "USD",
      createdAt: now,
      updatedAt: now
    });
    this.passwords.set("demo@finora.app", "password123");

    const bankId = this.createSeedAccount(userId, "Main Checking Bank", "BANK", "45000000", now);
    const cashId = this.createSeedAccount(userId, "Physical Cash Wallet", "CASH", "3500000", now);
    const savingsId = this.createSeedAccount(userId, "Emergency Savings Vault", "SAVINGS", "120000000", now);

    this.seedDemoTransactions(userId, now, bankId, cashId);
    this.seedDemoBudgets(userId, now);
    this.seedDemoGoal(userId, now, savingsId);

    this.recalculateAllBalances(userId);
  }

  private createSeedAccount(userId: string, name: string, type: AccountType, openingBalanceMinor: string, now: string): string {
    const id = generateId("acc");
    this.accounts.set(id, {
      id,
      userId,
      name,
      type,
      currencyCode: "USD",
      openingBalanceMinor,
      balanceMinor: openingBalanceMinor,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    });
    return id;
  }

  private seedDemoTransactions(userId: string, now: string, bankId: string, cashId: string): void {
    const foodCat = this.findCategoryByName("Food");
    const transportCat = this.findCategoryByName("Transport");
    const billsCat = this.findCategoryByName("Bills");
    const salaryCat = this.findCategoryByName("Salary");
    const todayStr = new Date().toISOString().split("T")[0] || "";
    const prevDate = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0] || "";

    if (foodCat) {
      this.seedTransaction(userId, bankId, foodCat.id, "EXPENSE", "4250", "Organic Groceries", todayStr, now);
    }
    if (transportCat) {
      this.seedTransaction(userId, cashId, transportCat.id, "EXPENSE", "1800", "Metro Transit Pass", todayStr, now);
    }
    if (billsCat) {
      this.seedTransaction(userId, bankId, billsCat.id, "EXPENSE", "8500", "High-speed Fiber Internet", prevDate, now);
    }
    if (salaryCat) {
      this.seedTransaction(userId, bankId, salaryCat.id, "INCOME", "32000000", "Monthly Engineering Retainer", prevDate, now);
    }
  }

  private seedTransaction(
    userId: string,
    accountId: string,
    categoryId: string,
    type: TransactionType,
    amountMinor: string,
    description: string,
    transactionDate: string,
    now: string
  ): void {
    const id = generateId("tx");
    this.transactions.set(id, {
      id,
      userId,
      accountId,
      categoryId,
      type,
      amountMinor,
      currencyCode: "USD",
      description,
      transactionDate,
      status: "ACTIVE",
      transferDirection: null,
      createdAt: now,
      updatedAt: now
    });
  }

  private seedDemoBudgets(userId: string, now: string): void {
    const foodCat = this.findCategoryByName("Food");
    const transportCat = this.findCategoryByName("Transport");
    const nowDate = new Date();
    const year = nowDate.getFullYear();
    const month = nowDate.getMonth() + 1;

    if (foodCat) {
      const id = generateId("bdg");
      this.budgets.set(id, {
        id,
        userId,
        categoryId: foodCat.id,
        year,
        month,
        limitMinor: "6000000",
        spentMinor: "0",
        remainingMinor: "6000000",
        createdAt: now,
        updatedAt: now
      });
    }
    if (transportCat) {
      const id = generateId("bdg");
      this.budgets.set(id, {
        id,
        userId,
        categoryId: transportCat.id,
        year,
        month,
        limitMinor: "2000000",
        spentMinor: "0",
        remainingMinor: "2000000",
        createdAt: now,
        updatedAt: now
      });
    }
  }

  private seedDemoGoal(userId: string, now: string, savingsAccountId: string): void {
    const id = generateId("gol");
    this.goals.set(id, {
      id,
      userId,
      accountId: savingsAccountId,
      name: "6-Month Emergency Safety Fund",
      targetAmountMinor: "150000000",
      targetDate: "2026-12-31",
      status: "ACTIVE",
      currentAmountMinor: this.accounts.get(savingsAccountId)?.balanceMinor ?? "0",
      progressPercent: 0,
      createdAt: now,
      updatedAt: now
    });
  }

  // ------------------------------------------------------------------
  // Financial Engine (server-simulated canonical truth)
  // ------------------------------------------------------------------
  private recalculateAllBalances(userId: string): void {
    const userAccounts = Array.from(this.accounts.values()).filter((account) => account.userId === userId);
    const userTransactions = Array.from(this.transactions.values()).filter(
      (tx) => tx.userId === userId && tx.status === "ACTIVE"
    );

    for (const account of userAccounts) {
      let balance = parseMinor(account.openingBalanceMinor);
      for (const tx of userTransactions) {
        if (tx.accountId !== account.id) continue;
        if (tx.type === "INCOME") {
          balance += parseMinor(tx.amountMinor);
        } else if (tx.type === "EXPENSE") {
          balance -= parseMinor(tx.amountMinor);
        } else if (tx.type === "TRANSFER") {
          const transferSource = Array.from(this.transfers.values()).find(
            (transfer) => transfer.sourceTransactionId === tx.id
          );
          if (transferSource) {
            balance -= parseMinor(tx.amountMinor);
          } else {
            balance += parseMinor(tx.amountMinor);
          }
        }
      }
      account.balanceMinor = balance.toString();
      account.updatedAt = new Date().toISOString();
    }
  }

  private async applySimulation(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    if (this.failNextNetwork) {
      this.failNextNetwork = false;
      throw createApiError("NETWORK_ERROR", "Simulated network failure for resilience tests.");
    }
    if (this.isOffline) {
      throw createApiError("NETWORK_ERROR", "No internet connection. API requests cannot be processed.");
    }
  }

  private async withSimulation<T>(operation: () => Promise<T> | T): Promise<T> {
    await this.applySimulation();
    return await operation();
  }

  // ------------------------------------------------------------------
  // Auth (A.5)
  // ------------------------------------------------------------------
  async register(req: RegisterRequest): Promise<ApiResponse<AuthResult>> {
    return this.withSimulation(async () => {
      const normalizedEmail = req.email.toLowerCase().trim();
      if (!normalizedEmail || !req.password) {
        throw createApiError("VALIDATION_ERROR", "Email and password are required.");
      }
      const exists = Array.from(this.users.values()).some((user) => user.email === normalizedEmail);
      if (exists) {
        throw createApiError("VALIDATION_ERROR", "An account with this email already exists.");
      }
      const baseCurrency = (req.baseCurrency || "USD").toUpperCase();
      if (!isSupportedCurrency(baseCurrency)) {
        throw createApiError("INVALID_CURRENCY", "Unsupported currency.");
      }
      const now = new Date().toISOString();
      const user: User = {
        id: generateId("usr"),
        email: normalizedEmail,
        baseCurrency,
        createdAt: now,
        updatedAt: now
      };
      this.users.set(user.id, user);
      this.passwords.set(normalizedEmail, req.password);
      return {
        data: {
          user,
          token: "tok_" + generateId("session")
        }
      };
    });
  }

  async login(req: LoginRequest): Promise<ApiResponse<AuthResult>> {
    return this.withSimulation(async () => {
      const normalizedEmail = req.email.toLowerCase().trim();
      const user = Array.from(this.users.values()).find((u) => u.email === normalizedEmail);
      const storedPass = this.passwords.get(normalizedEmail);
      if (!user || storedPass !== req.password) {
        throw createApiError("UNAUTHORIZED", "Invalid email address or password.");
      }
      return {
        data: {
          user,
          token: "tok_" + generateId("session")
        }
      };
    });
  }

  // ------------------------------------------------------------------
  // Collection pagination (server envelope parity)
  // ------------------------------------------------------------------
  // The real API pages every collection at 20/100 with
  // `{ data, meta: { nextCursor } }`. The mock mirrors that envelope in its
  // paged helpers so both adapters share the same bounded walk.
  private paginate<T extends { id: string }>(
    items: T[],
    cursor?: string,
    limit?: number,
  ): { data: T[]; meta: { nextCursor: string | null } } {
    const size = Math.min(Math.max(limit ?? 20, 1), 100);
    let start = 0;
    if (cursor) {
      const index = items.findIndex((item) => item.id === cursor);
      // Unknown/stale cursor ends the sequence, mirroring the server.
      if (index === -1) return { data: [], meta: { nextCursor: null } };
      start = index + 1;
    }
    const window = items.slice(start, start + size + 1);
    const data = window.slice(0, size);
    return {
      data,
      meta: { nextCursor: window.length > size ? (data[data.length - 1]?.id ?? null) : null },
    };
  }

  // ------------------------------------------------------------------
  // Accounts (A.5 /accounts)
  // ------------------------------------------------------------------
  async getAccounts(userId: string): Promise<ApiCollectionResponse<Account>> {
    return this.withSimulation(async () => {
      this.recalculateAllBalances(userId);
      const ordered = Array.from(this.accounts.values()).filter((account) => account.userId === userId);
      const page = async (cursor: string | undefined): Promise<PagedEnvelope<Account>> =>
        this.paginate(ordered, cursor, COLLECTION_PAGE_LIMIT);
      return { data: (await collectAllPages(page)).items, meta: { nextCursor: null } };
    });
  }

  async createAccount(userId: string, req: CreateAccountRequest): Promise<ApiResponse<Account>> {
    return this.withSimulation(() => {
      if (!isSupportedCurrency(req.currencyCode)) {
        throw createApiError("INVALID_CURRENCY", "Unsupported currency.");
      }
      if (!req.name || !req.name.trim()) {
        throw createApiError("INVALID_ACCOUNT_NAME", "Account name is required.");
      }
      if (!ACCOUNT_TYPES.includes(req.type)) {
        throw createApiError("VALIDATION_ERROR", "Invalid account type.");
      }
      if (!/^\d+$/.test(req.openingBalanceMinor)) {
        throw createApiError("INVALID_OPENING_BALANCE", "Opening balance must be a non-negative integer.");
      }
      const user = this.ensureUser(userId, req.currencyCode);
      // Single Base Currency (Master Contract / Section 7): accounts ALWAYS
      // adopt the user's immutable base currency — divergence is rejected at the
      // authority boundary (never in the client).
      const baseCurrency = user.baseCurrency;
      if (req.currencyCode && req.currencyCode.toUpperCase() !== baseCurrency.toUpperCase()) {
        throw createApiError(
          "INVALID_CURRENCY",
          "All accounts must use your base currency (" + baseCurrency + "). Currency changes are locked in MVP."
        );
      }
      const now = new Date().toISOString();
      const newAccount: Account = {
        id: generateId("acc"),
        userId,
        name: req.name.trim(),
        type: req.type,
        currencyCode: baseCurrency,
        openingBalanceMinor: req.openingBalanceMinor,
        balanceMinor: req.openingBalanceMinor,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now
      };
      this.accounts.set(newAccount.id, newAccount);
      return { data: newAccount };
    });
  }

  async archiveAccount(userId: string, accountId: string): Promise<ApiResponse<Account>> {
    return this.withSimulation(() => {
      const account = this.accounts.get(accountId);
      if (!account || account.userId !== userId) {
        throw createApiError("ACCOUNT_NOT_FOUND", "Account not found.");
      }
      if (account.status === "ARCHIVED") {
        throw createApiError("ACCOUNT_ARCHIVED", "Account is already archived.");
      }
      if (Array.from(this.goals.values()).some((goal) => goal.accountId === accountId && goal.status === "ACTIVE")) {
        throw createApiError("ACCOUNT_HAS_ACTIVE_GOAL", "An account with an active savings goal cannot be archived.");
      }
      account.status = "ARCHIVED";
      account.updatedAt = new Date().toISOString();
      return { data: account };
    });
  }

  async updateAccount(
    userId: string,
    accountId: string,
    req: UpdateAccountRequest
  ): Promise<ApiResponse<Account>> {
    return this.withSimulation(() => {
      const account = this.accounts.get(accountId);
      if (!account || account.userId !== userId) {
        throw createApiError("ACCOUNT_NOT_FOUND", "Account not found.");
      }
      if (req.name !== undefined) {
        if (typeof req.name !== "string" || req.name.length < 1 || req.name.length > 120) {
          throw createApiError("VALIDATION_ERROR", "Account name must be between 1 and 120 characters.");
        }
        account.name = req.name.trim();
        account.updatedAt = new Date().toISOString();
      }
      return { data: account };
    });
  }

  // ------------------------------------------------------------------
  // Categories (A.5 /categories)
  // ------------------------------------------------------------------
  async getCategories(userId: string): Promise<ApiCollectionResponse<Category>> {
    return this.withSimulation(async () => {
      const ordered = Array.from(this.categories.values()).filter(
        (category) => category.isSystem || category.userId === userId
      );
      const page = async (cursor: string | undefined): Promise<PagedEnvelope<Category>> =>
        this.paginate(ordered, cursor, COLLECTION_PAGE_LIMIT);
      return { data: (await collectAllPages(page)).items, meta: { nextCursor: null } };
    });
  }

  async createCategory(userId: string, req: CreateCategoryRequest): Promise<ApiResponse<Category>> {
    return this.withSimulation(() => {
      if (!req.name || !req.name.trim()) {
        throw createApiError("VALIDATION_ERROR", "Category name is required.");
      }
      // Contract (Section 9): category type is ONLY INCOME | EXPENSE.
      if (!CATEGORY_TYPES.includes(req.type)) {
        throw createApiError("VALIDATION_ERROR", "Category type must be INCOME or EXPENSE.");
      }
      const now = new Date().toISOString();
      const newCategory: Category = {
        id: generateId("cat"),
        userId,
        name: req.name.trim(),
        type: req.type,
        isSystem: false,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now
      };
      this.categories.set(newCategory.id, newCategory);
      return { data: newCategory };
    });
  }

  async deleteCategory(userId: string, categoryId: string): Promise<ApiResponse<Category>> {
    return this.withSimulation(() => {
      const category = this.categories.get(categoryId);
      // The server answers 404 for a missing OR system category (ownership hides
      // system rows from the user-facing archive route).
      if (!category || category.userId !== userId || category.isSystem) {
        throw createApiError("CATEGORY_NOT_FOUND", "Category not found.");
      }
      if (category.status === "ARCHIVED") {
        throw createApiError("CATEGORY_ARCHIVED", "The category is already archived.");
      }
      const archived: Category = { ...category, status: "ARCHIVED", updatedAt: new Date().toISOString() };
      this.categories.set(categoryId, archived);
      return { data: archived };
    });
  }

  // ------------------------------------------------------------------
  // Transactions (A.5 /transactions)
  // ------------------------------------------------------------------
  async getTransactions(userId: string, filters?: TransactionFilterParams): Promise<ApiCollectionResponse<Transaction>> {
    // Explicit cursor paging (unchanged): consumers pass cursor/limit and walk
    // pages themselves. The cursor is the item `id` (server envelope), never an
    // opaque offset; a stale cursor ends the sequence with an empty page.
    return this.withSimulation(() => {
      let list = Array.from(this.transactions.values()).filter((tx) => tx.userId === userId);
      if (filters?.accountId) {
        list = list.filter((tx) => tx.accountId === filters.accountId);
      }
      if (filters?.categoryId) {
        list = list.filter((tx) => tx.categoryId === filters.categoryId);
      }
      if (filters?.type) {
        list = list.filter((tx) => tx.type === filters.type);
      }
      if (filters?.from) {
        list = list.filter((tx) => tx.transactionDate >= (filters.from || ""));
      }
      if (filters?.to) {
        list = list.filter((tx) => tx.transactionDate <= (filters.to || ""));
      }
      list.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
      const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 100);
      let startIndex = 0;
      if (filters?.cursor) {
        const cursorIndex = list.findIndex((tx) => tx.id === filters.cursor);
        if (cursorIndex === -1) return { data: [], meta: { nextCursor: null } };
        startIndex = cursorIndex + 1;
      }
      const window = list.slice(startIndex, startIndex + limit + 1);
      const data = window.slice(0, limit);
      return {
        data,
        meta: { nextCursor: window.length > limit ? (data[data.length - 1]?.id ?? null) : null }
      };
    });
  }

  async createTransaction(userId: string, req: CreateTransactionRequest, idempotencyKey: string): Promise<ApiResponse<Transaction>> {
    return this.withSimulation(() => {
      if (idempotencyKey && this.idempotencyStore.has(idempotencyKey)) {
        return { data: this.idempotencyStore.get(idempotencyKey) as Transaction };
      }
      if (!isPositiveMinor(req.amountMinor)) {
        throw createApiError("INVALID_AMOUNT", "Transaction amount must be a positive integer in minor units.");
      }
      if (!req.transactionDate) {
        throw createApiError("VALIDATION_ERROR", "Transaction date is required.");
      }
      const account = this.accounts.get(req.accountId);
      if (!account || account.userId !== userId) {
        throw createApiError("ACCOUNT_NOT_FOUND", "Target account not found.");
      }
      if (account.status === "ARCHIVED") {
        throw createApiError("ACCOUNT_ARCHIVED", "Cannot create transactions on an archived account.");
      }
      if (req.type === "EXPENSE" && !req.categoryId) {
        throw createApiError("VALIDATION_ERROR", "Expense requires a category (BR-003).");
      }
      const now = new Date().toISOString();
      const newTransaction: Transaction = {
        id: generateId("tx"),
        userId,
        accountId: req.accountId,
        categoryId: req.type === "TRANSFER" ? null : req.categoryId || null,
        type: req.type,
        amountMinor: req.amountMinor,
        currencyCode: account.currencyCode,
        description: req.description ? req.description.trim() : null,
        transactionDate: req.transactionDate,
        status: "ACTIVE",
        transferDirection: null,
        createdAt: now,
        updatedAt: now
      };
      this.transactions.set(newTransaction.id, newTransaction);
      this.recalculateAllBalances(userId);
      if (idempotencyKey) {
        this.idempotencyStore.set(idempotencyKey, newTransaction);
      }
      return { data: newTransaction };
    });
  }

  async voidTransaction(userId: string, transactionId: string): Promise<ApiResponse<Transaction>> {
    return this.withSimulation(() => {
      const tx = this.transactions.get(transactionId);
      if (!tx || tx.userId !== userId) {
        throw createApiError("TRANSACTION_NOT_FOUND", "Transaction not found.");
      }
      if (tx.status === "VOIDED") {
        throw createApiError("TRANSACTION_ALREADY_VOIDED", "Transaction has already been voided.");
      }
      tx.status = "VOIDED";
      tx.updatedAt = new Date().toISOString();

      // Part of a transfer? Void the sibling too — a transfer is atomic.
      const linkedTransfer = Array.from(this.transfers.values()).find(
        (transfer) => transfer.sourceTransactionId === tx.id || transfer.destinationTransactionId === tx.id
      );
      if (linkedTransfer) {
        const siblingId =
          linkedTransfer.sourceTransactionId === tx.id
            ? linkedTransfer.destinationTransactionId
            : linkedTransfer.sourceTransactionId;
        const siblingTx = this.transactions.get(siblingId);
        if (siblingTx) {
          siblingTx.status = "VOIDED";
          siblingTx.updatedAt = new Date().toISOString();
        }
      }
      this.recalculateAllBalances(userId);
      return { data: tx };
    });
  }

  // ------------------------------------------------------------------
  // Transfers (A.5 /transfers)
  // ------------------------------------------------------------------
  async createTransfer(userId: string, req: CreateTransferRequest, idempotencyKey: string): Promise<ApiResponse<TransferCreationResult>> {
    return this.withSimulation(() => {
      const fingerprint = JSON.stringify(req);
      if (idempotencyKey) {
        const existing = this.transferIdempotency.get(idempotencyKey);
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            throw createApiError("DUPLICATE_REQUEST", "The idempotency key cannot be reused with different financial data.");
          }
          return existing.result;
        }
      }
      if (req.fromAccountId === req.toAccountId) {
        throw createApiError("SAME_ACCOUNT_TRANSFER", "Cannot transfer funds within the same account.");
      }
      if (!isPositiveMinor(req.amountMinor)) {
        throw createApiError("INVALID_AMOUNT", "Transfer amount must be a positive integer.");
      }
      const fromAccount = this.accounts.get(req.fromAccountId);
      const toAccount = this.accounts.get(req.toAccountId);
      if (!fromAccount || fromAccount.userId !== userId || !toAccount || toAccount.userId !== userId) {
        throw createApiError("ACCOUNT_NOT_FOUND", "One or both transfer accounts not found.");
      }
      if (fromAccount.status === "ARCHIVED" || toAccount.status === "ARCHIVED") {
        throw createApiError("ACCOUNT_ARCHIVED", "Cannot perform transfer involving an archived account.");
      }
      if (fromAccount.currencyCode !== toAccount.currencyCode) {
        throw createApiError("CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED", "Cross currency transfers are not supported in MVP.");
      }
      const now = new Date().toISOString();
      const sourceTxId = generateId("tx_src");
      const destTxId = generateId("tx_dst");
      const transferId = generateId("trf");

      const sourceTx: Transaction = {
        id: sourceTxId,
        userId,
        accountId: req.fromAccountId,
        categoryId: null, // Transfers NEVER have category (BR-004)
        type: "TRANSFER",
        amountMinor: req.amountMinor,
        currencyCode: fromAccount.currencyCode,
        description: "Transfer to " + toAccount.name,
        transactionDate: req.transactionDate,
        status: "ACTIVE",
        transferDirection: "SOURCE",
        createdAt: now,
        updatedAt: now
      };
      const destinationTx: Transaction = {
        id: destTxId,
        userId,
        accountId: req.toAccountId,
        categoryId: null,
        type: "TRANSFER",
        amountMinor: req.amountMinor,
        currencyCode: toAccount.currencyCode,
        description: "Transfer from " + fromAccount.name,
        transactionDate: req.transactionDate,
        status: "ACTIVE",
        transferDirection: "DESTINATION",
        createdAt: now,
        updatedAt: now
      };
      this.transactions.set(sourceTxId, sourceTx);
      this.transactions.set(destTxId, destinationTx);
      const transfer: Transfer = {
        id: transferId,
        userId,
        sourceTransactionId: sourceTxId,
        destinationTransactionId: destTxId,
        createdAt: now
      };
      this.transfers.set(transferId, transfer);
      this.recalculateAllBalances(userId);
      if (idempotencyKey) {
        this.transferIdempotency.set(idempotencyKey, { fingerprint, result: { data: { transfer, sourceTx, destinationTx } } });
      }
      return { data: { transfer, sourceTx, destinationTx } };
    });
  }

  // ------------------------------------------------------------------
  // Budgets (A.5 /budgets)
  // ------------------------------------------------------------------
  async getBudgets(userId: string): Promise<ApiCollectionResponse<Budget>> {
    return this.withSimulation(async () => {
      const ordered = Array.from(this.budgets.values())
        .filter((budget) => budget.userId === userId)
        // Canonical view: spend + usage aliases are derived, never the stored snapshot.
        .map((budget) => this.budgetView(budget));
      const page = async (cursor: string | undefined): Promise<PagedEnvelope<Budget>> =>
        this.paginate(ordered, cursor, COLLECTION_PAGE_LIMIT);
      return { data: (await collectAllPages(page)).items, meta: { nextCursor: null } };
    });
  }

  async createBudget(userId: string, req: CreateBudgetRequest): Promise<ApiResponse<Budget>> {
    return this.withSimulation(() => {
      if (!req.categoryId) {
        throw createApiError("VALIDATION_ERROR", "A category is required for a budget.");
      }
      if (!isPositiveMinor(req.limitMinor)) {
        throw createApiError("VALIDATION_ERROR", "Budget limit must be a positive integer.");
      }
      const existing = Array.from(this.budgets.values()).some(
        (budget) =>
          budget.userId === userId &&
          budget.categoryId === req.categoryId &&
          budget.year === req.year &&
          budget.month === req.month
      );
      if (existing) {
        throw createApiError("BUDGET_ALREADY_EXISTS", "A budget already exists for this category and month.");
      }
      const now = new Date().toISOString();
      const newBudget: Budget = {
        id: generateId("bdg"),
        userId,
        categoryId: req.categoryId,
        year: req.year,
        month: req.month,
        limitMinor: req.limitMinor,
        // Mirrors the real API response: a freshly created budget has no spend yet.
        spentMinor: "0",
        remainingMinor: req.limitMinor,
        createdAt: now,
        updatedAt: now
      };
      this.budgets.set(newBudget.id, newBudget);
      return { data: this.budgetView(newBudget) };
    });
  }

  async deleteBudget(userId: string, budgetId: string): Promise<ApiResponse<Record<string, never>>> {
    return this.withSimulation(() => {
      const budget = this.budgets.get(budgetId);
      if (!budget || budget.userId !== userId) {
        throw createApiError("BUDGET_NOT_FOUND", "Budget not found.");
      }
      this.budgets.delete(budgetId);
      return { data: {} };
    });
  }

  /**
   * Canonical `Budget` resource view (F-010).
   *
   * Mirrors `BudgetsService.view` and the Web mock's `withBudgetUsage`: spend is
   * derived from the ACTIVE EXPENSE transactions of that category/month — never a
   * stored snapshot — and the API emits the percentage/exceeded alias pairs, so a
   * Mobile screen reading `budget.progressPercent` behaves identically in mock and
   * real mode.
   */
  private budgetView(budget: Budget): Budget {
    const prefix = `${budget.year}-${String(budget.month).padStart(2, "0")}`;
    const spent = Array.from(this.transactions.values())
      .filter(
        (tx) =>
          tx.userId === budget.userId &&
          tx.categoryId === budget.categoryId &&
          tx.type === "EXPENSE" &&
          tx.status === "ACTIVE" &&
          tx.transactionDate.startsWith(prefix)
      )
      .reduce((sum, tx) => sum + parseMinor(tx.amountMinor), 0n);
    const limit = parseMinor(budget.limitMinor);
    const percentage = minorPercentage(spent, limit);
    const exceeded = spent > limit;
    return {
      ...budget,
      spentMinor: spent.toString(),
      remainingMinor: (limit - spent).toString(),
      percentage,
      progressPercent: percentage,
      usagePercentage: percentage,
      isExceeded: exceeded,
      exceeded
    };
  }

  // ------------------------------------------------------------------
  // Savings Goals (A.5 /savings-goals)
  /**
   * Canonical `SavingsGoal` resource view (F-010).
   *
   * Mirrors `GoalsService.view` and the Web mock's `deriveGoalProgress`: progress
   * comes from the linked account's current balance through `minorPercentage`, and
   * the API emits the `*Minor`/`*Percentage` alias pairs plus `accountName`.
   */
  private goalView(goal: SavingsGoal): SavingsGoal {
    const linkedAccount = this.accounts.get(goal.accountId);
    const current = linkedAccount ? parseMinor(linkedAccount.balanceMinor) : 0n;
    const progress = minorPercentage(current, parseMinor(goal.targetAmountMinor));
    return {
      ...goal,
      currentAmountMinor: current.toString(),
      currentBalanceMinor: current.toString(),
      progressPercent: progress,
      progressPercentage: progress,
      accountName: linkedAccount ? linkedAccount.name : "Savings Goal"
    };
  }

  // ------------------------------------------------------------------
  async getSavingsGoals(userId: string): Promise<ApiCollectionResponse<SavingsGoal>> {
    return this.withSimulation(async () => {
      this.recalculateAllBalances(userId);
      const ordered = Array.from(this.goals.values())
        .filter((goal) => goal.userId === userId)
        // Canonical view: progress/aliases are derived from the linked account.
        .map((goal) => this.goalView(goal));
      const page = async (cursor: string | undefined): Promise<PagedEnvelope<SavingsGoal>> =>
        this.paginate(ordered, cursor, COLLECTION_PAGE_LIMIT);
      return { data: (await collectAllPages(page)).items, meta: { nextCursor: null } };
    });
  }

  async createSavingsGoal(userId: string, req: CreateGoalRequest): Promise<ApiResponse<SavingsGoal>> {
    return this.withSimulation(() => {
      if (!req.name || !req.name.trim()) {
        throw createApiError("VALIDATION_ERROR", "Goal name is required.");
      }
      if (!isPositiveMinor(req.targetAmountMinor)) {
        throw createApiError("VALIDATION_ERROR", "Target amount must be a positive integer.");
      }
      const account = this.accounts.get(req.accountId);
      if (!account || account.userId !== userId) {
        throw createApiError("ACCOUNT_NOT_FOUND", "Linked account not found.");
      }
      if (account.type !== "SAVINGS") {
        throw createApiError("VALIDATION_ERROR", "Savings goal must be linked 1:1 to a SAVINGS account.");
      }
      const existingGoal = Array.from(this.goals.values()).find(
        (goal) => goal.accountId === req.accountId && goal.status === "ACTIVE"
      );
      if (existingGoal) {
        throw createApiError("VALIDATION_ERROR", "This savings account is already linked to an active goal.");
      }
      const now = new Date().toISOString();
      const newGoal: SavingsGoal = {
        id: generateId("gol"),
        userId,
        accountId: req.accountId,
        name: req.name.trim(),
        targetAmountMinor: req.targetAmountMinor,
        targetDate: req.targetDate || null,
        status: "ACTIVE",
        // The API computes goal progress from the linked account on every response.
        currentAmountMinor: account.balanceMinor,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now
      };
      this.goals.set(newGoal.id, newGoal);
      return { data: this.goalView(newGoal) };
    });
  }

  async archiveSavingsGoal(userId: string, goalId: string): Promise<ApiResponse<SavingsGoal>> {
    return this.withSimulation(() => {
      const goal = this.goals.get(goalId);
      if (!goal || goal.userId !== userId) {
        throw createApiError("GOAL_NOT_FOUND", "Goal not found.");
      }
      if (goal.status === "ARCHIVED") {
        throw createApiError("GOAL_ALREADY_ARCHIVED", "Goal already archived.");
      }
      goal.status = "ARCHIVED";
      goal.updatedAt = new Date().toISOString();
      return { data: this.goalView(goal) };
    });
  }

  // ------------------------------------------------------------------
  // Dashboard Summary (A.5 GET /dashboard/summary)
  // ------------------------------------------------------------------
  async getDashboardSummary(userId: string): Promise<ApiResponse<DashboardSummaryResponse>> {
    return this.withSimulation(() => {
      this.recalculateAllBalances(userId);
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const userAccounts = Array.from(this.accounts.values()).filter(
        (account) => account.userId === userId && account.status === "ACTIVE"
      );
      const totalMinor = userAccounts.reduce((sum, account) => sum + parseMinor(account.balanceMinor), 0n);

      const userTransactions = Array.from(this.transactions.values()).filter((tx) => {
        if (tx.userId !== userId || tx.status !== "ACTIVE") return false;
        const txDate = new Date(tx.transactionDate);
        return txDate.getFullYear() === year && txDate.getMonth() + 1 === month;
      });

      let incomeMinor = 0n;
      let expensesMinor = 0n;
      for (const tx of userTransactions) {
        if (tx.type === "INCOME") {
          incomeMinor += parseMinor(tx.amountMinor);
        } else if (tx.type === "EXPENSE") {
          expensesMinor += parseMinor(tx.amountMinor);
        }
      }
      // Mirrors the API: savings is `income - expenses` and may be negative.
      const savingsMinor = incomeMinor - expensesMinor;

      const userBudgets = Array.from(this.budgets.values()).filter(
        (budget) => budget.userId === userId && budget.year === year && budget.month === month
      );
      const budgetSummaries = userBudgets.map((budget) => {
        const category = this.categories.get(budget.categoryId);
        const spent = userTransactions
          .filter((tx) => tx.type === "EXPENSE" && tx.categoryId === budget.categoryId)
          .reduce((sum, tx) => sum + parseMinor(tx.amountMinor), 0n);
        const remaining = parseMinor(budget.limitMinor) - spent;
        const percentage = minorPercentage(spent, parseMinor(budget.limitMinor));
        const isExceeded = spent > parseMinor(budget.limitMinor);
        return {
          categoryId: budget.categoryId,
          categoryName: category ? category.name : "Uncategorized",
          limitMinor: budget.limitMinor,
          spentMinor: spent.toString(),
          remainingMinor: remaining.toString(),
          percentage,
          isExceeded,
          // The real API emits both alias pairs; keep mock parity.
          progressPercent: percentage,
          exceeded: isExceeded,
          usagePercentage: percentage
        };
      });

      const userGoals = Array.from(this.goals.values()).filter(
        (goal) => goal.userId === userId && goal.status === "ACTIVE"
      );
      const goalSummaries = userGoals.map((goal) => {
        const account = this.accounts.get(goal.accountId);
        const current = account ? parseMinor(account.balanceMinor) : 0n;
        // Same bounded percentage helper the real API uses (GoalsService.view).
        const progress = minorPercentage(current, parseMinor(goal.targetAmountMinor));
        return {
          id: goal.id,
          name: goal.name,
          accountId: goal.accountId,
          accountName: account ? account.name : "Linked Account",
          targetAmountMinor: goal.targetAmountMinor,
          currentAmountMinor: current.toString(),
          // The real API emits both alias names; keep mock parity.
          currentBalanceMinor: current.toString(),
          progressPercentage: progress,
          // The real API emits both alias names; keep mock parity.
          progressPercent: progress,
          targetDate: goal.targetDate,
          status: goal.status
        };
      });

      const payload: DashboardSummaryResponse = {
        period: { year, month },
        balances: { totalMinor: totalMinor.toString() },
        income: { minor: incomeMinor.toString() },
        expenses: { minor: expensesMinor.toString() },
        savings: { minor: savingsMinor.toString() },
        budgets: budgetSummaries,
        goals: goalSummaries
      };
      return { data: payload };
    });
  }
}

export const mockAdapter: ApiAdapter = new MockEngine();