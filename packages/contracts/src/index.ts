export const ACCOUNT_TYPES = ['CASH', 'BANK', 'SAVINGS'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CURRENCY_SPECS = [
  { code: 'USD', symbol: '$', label: 'US Dollar', minorUnit: 2 },
  { code: 'EUR', symbol: '€', label: 'Euro', minorUnit: 2 },
  { code: 'GBP', symbol: '£', label: 'British Pound', minorUnit: 2 },
  { code: 'AED', symbol: 'AED', label: 'UAE Dirham', minorUnit: 2 },
  { code: 'SAR', symbol: 'SAR', label: 'Saudi Riyal', minorUnit: 2 },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen', minorUnit: 0 },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar', minorUnit: 2 },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar', minorUnit: 2 },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc', minorUnit: 2 },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee', minorUnit: 2 },
  { code: 'KWD', symbol: 'KD ', label: 'Kuwaiti Dinar', minorUnit: 3 },
  { code: 'EGP', symbol: 'EGP ', label: 'Egyptian Pound', minorUnit: 2 },
] as const;

export type SupportedCurrency = (typeof CURRENCY_SPECS)[number]['code'];
export const SUPPORTED_CURRENCIES = CURRENCY_SPECS.map(({ code }) => code) as readonly SupportedCurrency[];
export const CURRENCY_MAP = Object.fromEntries(CURRENCY_SPECS.map((spec) => [spec.code, spec])) as Record<SupportedCurrency, (typeof CURRENCY_SPECS)[number]>;

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value.toUpperCase() as SupportedCurrency);
}

export function currencyMinorUnit(value: string): number | null {
  const spec = CURRENCY_MAP[value.toUpperCase() as SupportedCurrency];
  return spec?.minorUnit ?? null;
}

export const TRANSACTION_TYPES = ['INCOME', 'EXPENSE', 'TRANSFER'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['ACTIVE', 'VOIDED'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type MoneyMinor = string;

/**
 * Category type (A.3): categories are INCOME or EXPENSE only — TRANSFER legs
 * never carry a category. Mirrors the `CategoryType` column/enum on the API side.
 */
export const CATEGORY_TYPES = ['INCOME', 'EXPENSE'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const CATEGORY_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export const GOAL_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** Direction of a TRANSFER leg: SOURCE is debited, DESTINATION is credited (FI-002). */
export const TRANSFER_DIRECTIONS = ['SOURCE', 'DESTINATION'] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];

export const ERROR_CODES = [
  'INVALID_AMOUNT',
  'INVALID_CURRENCY',
  'INVALID_ACCOUNT_NAME',
  'INVALID_OPENING_BALANCE',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_NOT_OWNED',
  'ACCOUNT_ARCHIVED',
  'ACCOUNT_HAS_ACTIVE_GOAL',
  'CATEGORY_NOT_FOUND',
  'CATEGORY_NOT_OWNED',
  'CATEGORY_ARCHIVED',
  'INVALID_CATEGORY_TYPE',
  'TRANSACTION_NOT_FOUND',
  'TRANSACTION_NOT_OWNED',
  'TRANSACTION_ALREADY_VOIDED',
  'INSUFFICIENT_FUNDS',
  'INVALID_TRANSFER',
  'SAME_ACCOUNT_TRANSFER',
  'CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED',
  'BUDGET_ALREADY_EXISTS',
  'BUDGET_NOT_FOUND',
  'GOAL_NOT_FOUND',
  'GOAL_NOT_OWNED',
  'GOAL_ALREADY_ARCHIVED',
  'DUPLICATE_REQUEST',
  'BASE_CURRENCY_MISMATCH',
  'BASE_CURRENCY_LOCKED',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR';

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiCollection<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

export interface ApiError {
  error: { code: ErrorCode; message: string; requestId: string };
}

/** Client-facing aliases for the envelope interfaces above. */
export type SuccessEnvelope<T> = ApiSuccess<T>;
export type CollectionEnvelope<T> = ApiCollection<T>;

/**
 * Client-facing error envelope. Widens `ApiError.code` to `ClientErrorCode`
 * because clients synthesize transport failures (e.g. `NETWORK_ERROR`) that the
 * server never emits.
 */
export interface ErrorEnvelope {
  error: { code: ClientErrorCode; message: string; requestId: string };
}

// ===========================================================================
// CANONICAL RESOURCE SHAPES
//
// This block is the single authoritative source for the complete API
// request/response shapes shared by the API, Web and Mobile clients. Runtime
// validation stays in the NestJS DTOs (`Apps/api/src/**/*.dto.ts`); these types
// describe what those DTOs/routes accept and what the API returns.
//
// Fields the live API does not currently serialize (persistence/audit columns
// the clients and their mock servers still carry) are optional and flagged.
// Each `*_API_FIELDS` manifest lists exactly the fields the OpenAPI document and
// the runtime responses must expose; it is asserted by the contract-drift test.
// ===========================================================================

export interface User {
  id: string;
  email: string;
  baseCurrency: string;
  /** Mock/legacy convenience field — the live API does not serialize user timestamps. */
  createdAt?: string;
  /** Mock/legacy convenience field — the live API does not serialize user timestamps. */
  updatedAt?: string;
}

export interface AuthSession {
  /** Opaque bearer session token (never a JWT). */
  token: string;
  user: User;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: string;
  status: AccountStatus;
  openingBalanceMinor: MoneyMinor;
  balanceMinor: MoneyMinor;
  /** Persisted ownership field kept by the clients/mocks — not serialized by the live API. */
  userId?: string;
  /** Persisted audit field kept by the clients/mocks — not serialized by the live API. */
  createdAt?: string;
  /** Persisted audit field kept by the clients/mocks — not serialized by the live API. */
  updatedAt?: string;
}

export interface Category {
  id: string;
  /** `null` for built-in system categories. */
  userId: string | null;
  name: string;
  type: CategoryType;
  isSystem: boolean;
  status: CategoryStatus;
  /** Mock/legacy convenience field — the live API does not serialize category timestamps. */
  createdAt?: string;
  /** Mock/legacy convenience field — the live API does not serialize category timestamps. */
  updatedAt?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amountMinor: MoneyMinor;
  currencyCode: string;
  description: string | null;
  transactionDate: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  /** `null`/absent for INCOME and EXPENSE; set to a leg direction for TRANSFER rows. */
  transferDirection?: TransferDirection | null;
}

export interface Transfer {
  id: string;
  userId: string;
  sourceTransactionId: string;
  destinationTransactionId: string;
  createdAt: string;
}

export interface TransferCreationResult {
  transfer: Transfer;
  sourceTx: Transaction;
  destinationTx: Transaction;
}

export interface Budget {
  id: string;
  categoryId: string;
  year: number;
  month: number;
  limitMinor: MoneyMinor;
  spentMinor: MoneyMinor;
  remainingMinor: MoneyMinor;
  /** Mock/legacy convenience fields — the live API does not serialize budget ownership/timestamps. */
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Computed usage aliases emitted by `BudgetsService.view`. */
  percentage?: number;
  isExceeded?: boolean;
  progressPercent?: number;
  exceeded?: boolean;
  usagePercentage?: number;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  accountId: string;
  name: string;
  targetAmountMinor: MoneyMinor;
  targetDate: string | null;
  status: GoalStatus;
  currentAmountMinor: MoneyMinor;
  progressPercent: number;
  /** Computed aliases/context emitted by `GoalsService.view`. */
  currentBalanceMinor?: MoneyMinor;
  progressPercentage?: number;
  accountName?: string;
  /** Mock/legacy convenience fields — the live API does not serialize goal timestamps. */
  createdAt?: string;
  updatedAt?: string;
}

export interface DashboardBudget {
  categoryId: string;
  categoryName: string;
  limitMinor: MoneyMinor;
  spentMinor: MoneyMinor;
  remainingMinor: MoneyMinor;
  progressPercent: number;
  exceeded: boolean;
  percentage: number;
  isExceeded: boolean;
  usagePercentage?: number;
}

export interface DashboardGoal {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  targetAmountMinor: MoneyMinor;
  currentAmountMinor: MoneyMinor;
  progressPercent: number;
  progressPercentage: number;
  targetDate: string | null;
  status: GoalStatus;
  currentBalanceMinor?: MoneyMinor;
}

export interface DashboardSummary {
  period: { year: number; month: number };
  balances: { totalMinor: MoneyMinor };
  income: { minor: MoneyMinor };
  expenses: { minor: MoneyMinor };
  savings: { minor: MoneyMinor };
  budgets: DashboardBudget[];
  goals: DashboardGoal[];
}

// ===========================================================================
// CANONICAL REQUEST SHAPES (mirror the NestJS DTOs)
// ===========================================================================

export interface RegisterRequest {
  email: string;
  password: string;
  /** Required by the API DTO; the mock adapters default to USD when omitted. */
  baseCurrency?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  /** Required by the API DTO; kept optional here because the clients always send it. */
  baseCurrency?: string;
}

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  currencyCode: string;
  openingBalanceMinor: MoneyMinor;
}

export interface UpdateAccountRequest {
  name?: string;
}

export interface CreateCategoryRequest {
  name: string;
  type: CategoryType;
}

/** Rename-only, matching `UpdateCategoryDto` and `forbidNonWhitelisted`. */
export interface UpdateCategoryRequest {
  name: string;
}

export interface CreateTransactionRequest {
  type: TransactionType;
  accountId: string;
  categoryId?: string | null;
  amountMinor: MoneyMinor;
  description?: string | null;
  transactionDate: string;
}

export interface UpdateTransactionRequest {
  description?: string | null;
  transactionDate?: string;
}

export interface CreateTransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: MoneyMinor;
  transactionDate: string;
}

export interface UpdateTransferRequest {
  transactionDate?: string;
}

export interface CreateBudgetRequest {
  categoryId: string;
  year: number;
  month: number;
  limitMinor: MoneyMinor;
}

export interface UpdateBudgetRequest {
  limitMinor: MoneyMinor;
}

export interface CreateSavingsGoalRequest {
  accountId: string;
  name: string;
  targetAmountMinor: MoneyMinor;
  targetDate?: string | null;
}

/** Rename-only, matching `UpdateGoalDto` and `forbidNonWhitelisted`. */
export interface UpdateSavingsGoalRequest {
  name: string;
}

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

// ===========================================================================
// PUBLIC API FIELD MANIFESTS
//
// The exact fields the OpenAPI document and the runtime responses must expose
// for each resource. They are a subset of the interfaces above and are asserted
// against both artifacts by `Apps/api/test/contract-shapes-drift.spec.ts`.
// ===========================================================================

export const USER_API_FIELDS = ['id', 'email', 'baseCurrency'] as const satisfies readonly (keyof User)[];

export const ACCOUNT_API_FIELDS = [
  'id',
  'name',
  'type',
  'currencyCode',
  'status',
  'openingBalanceMinor',
  'balanceMinor',
] as const satisfies readonly (keyof Account)[];

export const CATEGORY_API_FIELDS = [
  'id',
  'userId',
  'name',
  'type',
  'isSystem',
  'status',
] as const satisfies readonly (keyof Category)[];

export const TRANSACTION_API_FIELDS = [
  'id',
  'userId',
  'accountId',
  'categoryId',
  'type',
  'amountMinor',
  'currencyCode',
  'description',
  'transactionDate',
  'status',
  'createdAt',
  'updatedAt',
  'transferDirection',
] as const satisfies readonly (keyof Transaction)[];

export const TRANSFER_API_FIELDS = [
  'id',
  'userId',
  'sourceTransactionId',
  'destinationTransactionId',
  'createdAt',
] as const satisfies readonly (keyof Transfer)[];

export const BUDGET_API_FIELDS = [
  'id',
  'categoryId',
  'year',
  'month',
  'limitMinor',
  'spentMinor',
  'remainingMinor',
  'percentage',
  'isExceeded',
  'progressPercent',
  'exceeded',
  'usagePercentage',
] as const satisfies readonly (keyof Budget)[];

export const SAVINGS_GOAL_API_FIELDS = [
  'id',
  'userId',
  'accountId',
  'name',
  'targetAmountMinor',
  'targetDate',
  'status',
  'currentAmountMinor',
  'currentBalanceMinor',
  'progressPercent',
  'progressPercentage',
  'accountName',
] as const satisfies readonly (keyof SavingsGoal)[];

export const DASHBOARD_SUMMARY_API_FIELDS = [
  'period',
  'balances',
  'income',
  'expenses',
  'savings',
  'budgets',
  'goals',
] as const satisfies readonly (keyof DashboardSummary)[];

export const DASHBOARD_BUDGET_API_FIELDS = [
  'categoryId',
  'categoryName',
  'limitMinor',
  'spentMinor',
  'remainingMinor',
  'progressPercent',
  'exceeded',
  'percentage',
  'isExceeded',
  'usagePercentage',
] as const satisfies readonly (keyof DashboardBudget)[];

export const DASHBOARD_GOAL_API_FIELDS = [
  'id',
  'name',
  'accountId',
  'accountName',
  'targetAmountMinor',
  'currentAmountMinor',
  'currentBalanceMinor',
  'progressPercent',
  'progressPercentage',
  'targetDate',
  'status',
] as const satisfies readonly (keyof DashboardGoal)[];

// ===========================================================================
// PUBLIC REQUEST FIELD MANIFESTS
//
// The exact body/query fields each documented endpoint accepts. They mirror the
// `*Request` interfaces above and are asserted against the NestJS DTO sources by
// `Apps/api/test/contract-shapes-drift.spec.ts`, so a DTO can never gain or lose
// a field without an explicit contract change.
// ===========================================================================

export const REGISTER_REQUEST_FIELDS = ['email', 'password', 'baseCurrency'] as const satisfies readonly (keyof RegisterRequest)[];

export const LOGIN_REQUEST_FIELDS = ['email', 'password'] as const satisfies readonly (keyof LoginRequest)[];

export const UPDATE_PROFILE_REQUEST_FIELDS = ['baseCurrency'] as const satisfies readonly (keyof UpdateProfileRequest)[];

export const CREATE_ACCOUNT_REQUEST_FIELDS = ['name', 'type', 'currencyCode', 'openingBalanceMinor'] as const satisfies readonly (keyof CreateAccountRequest)[];

export const UPDATE_ACCOUNT_REQUEST_FIELDS = ['name'] as const satisfies readonly (keyof UpdateAccountRequest)[];

export const CREATE_CATEGORY_REQUEST_FIELDS = ['name', 'type'] as const satisfies readonly (keyof CreateCategoryRequest)[];

export const UPDATE_CATEGORY_REQUEST_FIELDS = ['name'] as const satisfies readonly (keyof UpdateCategoryRequest)[];

export const CREATE_TRANSACTION_REQUEST_FIELDS = ['type', 'accountId', 'categoryId', 'amountMinor', 'description', 'transactionDate'] as const satisfies readonly (keyof CreateTransactionRequest)[];

export const UPDATE_TRANSACTION_REQUEST_FIELDS = ['description', 'transactionDate'] as const satisfies readonly (keyof UpdateTransactionRequest)[];

export const TRANSACTION_FILTER_REQUEST_FIELDS = ['accountId', 'categoryId', 'type', 'from', 'to', 'cursor', 'limit'] as const satisfies readonly (keyof TransactionFilters)[];

export const CREATE_TRANSFER_REQUEST_FIELDS = ['fromAccountId', 'toAccountId', 'amountMinor', 'transactionDate'] as const satisfies readonly (keyof CreateTransferRequest)[];

export const UPDATE_TRANSFER_REQUEST_FIELDS = ['transactionDate'] as const satisfies readonly (keyof UpdateTransferRequest)[];

export const CREATE_BUDGET_REQUEST_FIELDS = ['categoryId', 'year', 'month', 'limitMinor'] as const satisfies readonly (keyof CreateBudgetRequest)[];

export const UPDATE_BUDGET_REQUEST_FIELDS = ['limitMinor'] as const satisfies readonly (keyof UpdateBudgetRequest)[];

export const CREATE_SAVINGS_GOAL_REQUEST_FIELDS = ['accountId', 'name', 'targetAmountMinor', 'targetDate'] as const satisfies readonly (keyof CreateSavingsGoalRequest)[];

export const UPDATE_SAVINGS_GOAL_REQUEST_FIELDS = ['name'] as const satisfies readonly (keyof UpdateSavingsGoalRequest)[];

