/**
 * API ADAPTER CONTRACT (Section 27, 28, 29).
 * Feature layer depends ONLY on `api.ts` (the ApiClient facade), NEVER on
 * an adapter directly — so the Mock Adapter can be swapped for the Real HTTP
 * Adapter without touching feature components.
 *
 * All adapters speak the documented `/api/v1` shapes (A.5/A.6).
 */

import type {
  Account,
  ApiCollectionResponse,
  ApiResponse,
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
  Transfer,
  UpdateAccountRequest,
  User
} from "../../types/contract";

export interface TransferCreationResult {
  transfer: Transfer;
  sourceTx: Transaction;
  destinationTx: Transaction;
}

export type AuthResult = { user: User; token: string };

export interface ApiAdapter {
  /** Session token used by the Real HTTP adapter (Bearer). Mock ignores it. */
  setToken(token: string | null): void;

  // Auth
  register(req: RegisterRequest): Promise<ApiResponse<AuthResult>>;
  login(req: LoginRequest): Promise<ApiResponse<AuthResult>>;
  /** Exchanges the current session token for a fresh one (server revokes the old one). */
  refresh(): Promise<ApiResponse<AuthResult>>;
  logout(): Promise<void>;

  // Dashboard
  getDashboardSummary(userId: string): Promise<ApiResponse<DashboardSummaryResponse>>;

  // Accounts
  getAccounts(userId: string): Promise<ApiCollectionResponse<Account>>;
  createAccount(userId: string, req: CreateAccountRequest): Promise<ApiResponse<Account>>;
  updateAccount(userId: string, accountId: string, req: UpdateAccountRequest): Promise<ApiResponse<Account>>;
  archiveAccount(userId: string, accountId: string): Promise<ApiResponse<Account>>;

  // Categories
  getCategories(userId: string): Promise<ApiCollectionResponse<Category>>;
  createCategory(userId: string, req: CreateCategoryRequest): Promise<ApiResponse<Category>>;
  deleteCategory(userId: string, categoryId: string): Promise<ApiResponse<Category>>;

  // Transactions
  getTransactions(userId: string, filters?: TransactionFilterParams): Promise<ApiCollectionResponse<Transaction>>;
  createTransaction(userId: string, req: CreateTransactionRequest, idempotencyKey: string): Promise<ApiResponse<Transaction>>;
  voidTransaction(userId: string, transactionId: string): Promise<ApiResponse<Transaction>>;

  // Transfers
  createTransfer(userId: string, req: CreateTransferRequest, idempotencyKey: string): Promise<ApiResponse<TransferCreationResult>>;

  // Budgets
  getBudgets(userId: string): Promise<ApiCollectionResponse<Budget>>;
  createBudget(userId: string, req: CreateBudgetRequest): Promise<ApiResponse<Budget>>;
  deleteBudget(userId: string, budgetId: string): Promise<ApiResponse<Record<string, never>>>;

  // Savings Goals
  getSavingsGoals(userId: string): Promise<ApiCollectionResponse<SavingsGoal>>;
  createSavingsGoal(userId: string, req: CreateGoalRequest): Promise<ApiResponse<SavingsGoal>>;
  archiveSavingsGoal(userId: string, goalId: string): Promise<ApiResponse<SavingsGoal>>;
}