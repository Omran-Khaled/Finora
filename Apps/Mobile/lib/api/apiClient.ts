/**
 * FINORA API CLIENT (Section 15, 27, 28, 29).
 * Feature layer depends ONLY on this facade.
 * - Selects the adapter explicitly: mock (EXPO_PUBLIC_USE_REAL_API=0) or real HTTP
 *   (EXPO_PUBLIC_USE_REAL_API=1 + EXPO_PUBLIC_API_URL). Production requires real.
 * - Persists session/token via the Secure Storage abstraction (Section 30/31).
 * - Financial writes carry an idempotency key; financial POSTs are NEVER blindly retried (Section 15).
 * - Error envelopes normalized; user-facing messages derived by components via toUserMessage..
 * - No client-side financial authority: balances/budget/goal truth comes from the adapter.
 */

import type {
  Account,
  ApiCollectionResponse,
  ApiErrorEnvelope,
  Budget,
  Category,
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
  UpdateAccountRequest,
  User
} from "../../types/contract";
import { SecureStorage } from "../storage/secureStorage";
import { createApiError, isApiError } from "./errors";
import { FinancialIntentKeyManager } from "./idempotency";
import type { ApiAdapter, TransferCreationResult } from "./adapter";
import { mockAdapter } from "./mockAdapter";
import { httpAdapter } from "./httpAdapter";
import { resolveMobileApiConfig } from "./apiConfig";

const nodeEnvironment = process.env.NODE_ENV;
const environment =
  nodeEnvironment === "production" ? "production" : nodeEnvironment === "test" ? "test" : "development";
const apiConfig = resolveMobileApiConfig(
  process.env.EXPO_PUBLIC_USE_REAL_API,
  process.env.EXPO_PUBLIC_API_URL,
  environment,
);
export const isRealApiEnabled = apiConfig.useRealApi;

function selectAdapter(): ApiAdapter {
  return apiConfig.useRealApi ? httpAdapter : mockAdapter;
}

class ApiClient {
  private adapter: ApiAdapter = selectAdapter();
  private readonly transactionIntentKeys = new FinancialIntentKeyManager();
  private readonly transferIntentKeys = new FinancialIntentKeyManager();

  getAdapter(): ApiAdapter {
    return this.adapter;
  }

  /** Swaps the adapter (used in tests to verify Mock ↔ Real compatibility at the call-shape level). */
  setAdapter(adapter: ApiAdapter): void {
    this.adapter = adapter;
  }

  private async getUserId(): Promise<string> {
    const raw = await SecureStorage.getItem("session_user");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as User;
        if (parsed.id) return parsed.id;
      } catch {
        // fall through
      }
    }
    if (isRealApiEnabled) {
      throw new Error("No authenticated user session is present for the real API");
    }
    // Demo/mock path ? the mock back-end seeds this identity.
    return "usr_demo_finora";
  }

  private async ensureAdapterSession(): Promise<void> {
    const token = await SecureStorage.getItem("auth_token");
    this.adapter.setToken(token);
  }

  private handleError(err: unknown): never {
    if (isApiError(err)) throw err as ApiErrorEnvelope;
    throw createApiError("NETWORK_ERROR", "We couldn't connect to the service. Please try again.");
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureAdapterSession();
    try {
      return await operation();
    } catch (err) {
      this.handleError(err);
    }
  }

  // ==========================================
  // Auth
  // ==========================================
  async register(payload: RegisterRequest): Promise<{ user: User; token: string }> {
    return this.run(async () => {
      const res = await this.adapter.register(payload);
      await SecureStorage.setItem("auth_token", res.data.token);
      await SecureStorage.setItem("session_user", JSON.stringify(res.data.user));
      this.adapter.setToken(res.data.token);
      return res.data;
    });
  }

  async login(payload: LoginRequest): Promise<{ user: User; token: string }> {
    return this.run(async () => {
      const res = await this.adapter.login(payload);
      await SecureStorage.setItem("auth_token", res.data.token);
      await SecureStorage.setItem("session_user", JSON.stringify(res.data.user));
      this.adapter.setToken(res.data.token);
      return res.data;
    });
  }

  async logout(): Promise<void> {
    try {
      await this.ensureAdapterSession();
      await this.adapter.logout();
    } catch {
      // Ignore backend logout errors and clear the local session as a fallback.
    } finally {
      await SecureStorage.clearSession();
      this.adapter.setToken(null);
    }
  }

  /**
   * Refreshes the session and persists the rotated token/user. Called by the
   * adapter's 401-once-then-retry path and available to the auth provider.
   */
  async refresh(): Promise<{ user: User; token: string }> {
    return this.run(async () => {
      const res = await this.adapter.refresh();
      await SecureStorage.setItem("auth_token", res.data.token);
      await SecureStorage.setItem("session_user", JSON.stringify(res.data.user));
      return res.data;
    });
  }

  async getCurrentUser(): Promise<User | null> {
    const raw = await SecureStorage.getItem("session_user");
    if (!raw) return null;
    if (isRealApiEnabled && !(await SecureStorage.getItem("auth_token"))) {
      await SecureStorage.clearSession();
      return null;
    }
    try {
      return JSON.parse(raw) as User;
    } catch {
      await SecureStorage.clearSession();
      return null;
    }
  }

  // ==========================================
  // Dashboard (A.5 GET /dashboard/summary)
  // ==========================================
  async getDashboardSummary(): Promise<DashboardSummaryResponse> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.getDashboardSummary(userId);
      return res.data;
    });
  }

  // ==========================================
  // Accounts
  // ==========================================
  async getAccounts(): Promise<Account[]> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.getAccounts(userId);
      return res.data;
    });
  }

  async createAccount(req: CreateAccountRequest): Promise<Account> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.createAccount(userId, req);
      return res.data;
    });
  }

  async updateAccount(accountId: string, req: UpdateAccountRequest): Promise<Account> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.updateAccount(userId, accountId, req);
      return res.data;
    });
  }

  async archiveAccount(accountId: string): Promise<Account> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.archiveAccount(userId, accountId);
      return res.data;
    });
  }

  // ==========================================
  // Categories
  // ==========================================
  async getCategories(): Promise<Category[]> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.getCategories(userId);
      return res.data;
    });
  }

  async createCategory(req: CreateCategoryRequest): Promise<Category> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.createCategory(userId, req);
      return res.data;
    });
  }

  async deleteCategory(categoryId: string): Promise<boolean> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.deleteCategory(userId, categoryId);
      return res.data.status === "ARCHIVED";
    });
  }

  // ==========================================
  // Transactions
  // ==========================================
  async getTransactions(filters?: TransactionFilterParams): Promise<ApiCollectionResponse<Transaction>> {
    return this.run(async () => {
      const userId = await this.getUserId();
      return await this.adapter.getTransactions(userId, filters);
    });
  }

  async createTransaction(req: CreateTransactionRequest): Promise<Transaction> {
    return this.run(async () => {
      const userId = await this.getUserId();
      return this.transactionIntentKeys.execute(
        userId,
        req,
        async (idempotencyKey) => {
          const res = await this.adapter.createTransaction(
            userId,
            req,
            idempotencyKey,
          );
          return res.data;
        },
      );
    });
  }

  async voidTransaction(transactionId: string): Promise<Transaction> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.voidTransaction(userId, transactionId);
      return res.data;
    });
  }

  // ==========================================
  // Transfers
  // ==========================================
  async createTransfer(req: CreateTransferRequest): Promise<TransferCreationResult> {
    return this.run(async () => {
      const userId = await this.getUserId();
      return this.transferIntentKeys.execute(
        userId,
        req,
        async (idempotencyKey) => {
          const res = await this.adapter.createTransfer(
            userId,
            req,
            idempotencyKey,
          );
          return res.data;
        },
      );
    });
  }

  // ==========================================
  // Budgets
  // ==========================================
  async getBudgets(): Promise<Budget[]> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.getBudgets(userId);
      return res.data;
    });
  }

  async createBudget(req: CreateBudgetRequest): Promise<Budget> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.createBudget(userId, req);
      return res.data;
    });
  }

  async deleteBudget(budgetId: string): Promise<boolean> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.deleteBudget(userId, budgetId);
      void res;
      return true;
    });
  }

  // ==========================================
  // Savings Goals
  // ==========================================
  async getSavingsGoals(): Promise<SavingsGoal[]> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.getSavingsGoals(userId);
      return res.data;
    });
  }

  async createSavingsGoal(req: CreateGoalRequest): Promise<SavingsGoal> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.createSavingsGoal(userId, req);
      return res.data;
    });
  }

  async archiveSavingsGoal(goalId: string): Promise<SavingsGoal> {
    return this.run(async () => {
      const userId = await this.getUserId();
      const res = await this.adapter.archiveSavingsGoal(userId, goalId);
      return res.data;
    });
  }
}

export const api = new ApiClient();