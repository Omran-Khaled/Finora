/**
 * FINORA CANONICAL CONTRACT — client re-export.
 *
 * The single source of truth for every resource/request/response shape is
 * `@finora/contracts`. This module only re-exports it under the names the
 * Mobile app already uses, so Web, Mobile and the API cannot drift apart.
 *
 * Backend remains the Financial Authority; the client only parses/renders.
 */
export type {
  Account,
  AccountStatus,
  AccountType,
  AuthSession,
  Budget,
  Category,
  CategoryStatus,
  CategoryType,
  CreateAccountRequest,
  CreateBudgetRequest,
  CreateCategoryRequest,
  CreateSavingsGoalRequest,
  CreateTransactionRequest,
  CreateTransferRequest,
  GoalStatus,
  LoginRequest,
  MoneyMinor,
  RegisterRequest,
  SavingsGoal,
  Transaction,
  TransactionStatus,
  TransactionType,
  Transfer,
  TransferDirection,
  UpdateAccountRequest,
  UpdateBudgetRequest,
  UpdateTransactionRequest,
  User,
} from '@finora/contracts';

// Client-facing aliases preserved for the existing Mobile call sites.
export type { ClientErrorCode as ApiErrorCode } from '@finora/contracts';
export type { ApiSuccess as ApiResponse } from '@finora/contracts';
export type { ApiCollection as ApiCollectionResponse } from '@finora/contracts';
export type { ErrorEnvelope as ApiErrorEnvelope } from '@finora/contracts';
export type { DashboardSummary as DashboardSummaryResponse } from '@finora/contracts';
export type { CreateSavingsGoalRequest as CreateGoalRequest } from '@finora/contracts';
export type { TransactionFilters as TransactionFilterParams } from '@finora/contracts';

