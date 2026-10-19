import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  AccountStatus,
  AccountType,
  GoalStatus,
  TransactionStatus,
  TransactionType,
  TransferDirection,
} from "@finora/contracts";

/**
 * Swagger-only response documentation models.
 *
 * These classes describe the shapes the Finora API actually returns and are
 * used exclusively to build the OpenAPI document. They have no runtime
 * behaviour. Shapes follow the canonical contract in
 * `docs/contracts/financial-core-contract.md` and `packages/contracts`.
 *
 * Naming convention:
 * - `<Resource>`            -> an entity as returned by the API.
 * - `<Resource>Response`    -> the `{ "data": <Resource> }` wrapper.
 * - `<Resource>ListResponse`-> the `{ "data": [<Resource>], "meta" }` wrapper.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export class ErrorBody {
  @ApiProperty({
    type: Object,
    description: "Structured error payload returned on every failed request.",
  })
  error!: {
    code: string;
    message: string;
    requestId: string;
  };
}

export class Meta {
  @ApiProperty({
    type: "string",
    nullable: true,
    description:
      "Cursor for the next page of results (`id` of the last item). `null` when there are no more pages.",
    example: null,
  })
  nextCursor!: string | null;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export class UserProfile {
  @ApiProperty({
    type: "string",
    format: "uuid",
    description: "Unique user identifier.",
    example: "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
  })
  id!: string;

  @ApiProperty({
    type: "string",
    format: "email",
    description: "Normalized (lowercased) email address.",
    example: "sarah@example.com",
  })
  email!: string;

  @ApiProperty({
    type: "string",
    minLength: 3,
    maxLength: 3,
    description: "ISO 4217 currency code used as the user's base currency.",
    example: "USD",
  })
  baseCurrency!: string;
}

export class UserSession {
  @ApiProperty({
    type: "string",
    description:
      "Opaque bearer session token. Send it in the `Authorization: Bearer <token>` header or the `x-session-token` header. It is not a JWT.",
    example: "3f1c9a2e-b4d5-4e6f-8a7b-9c0d1e2f3a4b",
  })
  token!: string;

  @ApiProperty({ type: () => UserProfile, description: "The authenticated user profile." })
  user!: UserProfile;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export class Account {
  @ApiProperty({ type: "string", format: "uuid", description: "Account identifier.", example: "9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f" })
  id!: string;

  @ApiProperty({ type: "string", description: "Human-readable account name.", example: "Main Bank" })
  name!: string;

  @ApiProperty({ type: "string", enum: ["CASH", "BANK", "SAVINGS"], description: "Account type.", example: "BANK" })
  type!: AccountType;

  @ApiProperty({ type: "string", minLength: 3, maxLength: 3, description: "ISO 4217 currency code.", example: "USD" })
  currencyCode!: string;

  @ApiProperty({ type: "string", enum: ["ACTIVE", "ARCHIVED"], description: "Account lifecycle status.", example: "ACTIVE" })
  status!: AccountStatus;

  @ApiProperty({ type: "string", pattern: "^(0|[1-9][0-9]*)$", description: "Opening balance in decimal minor units (exact string).", example: "250000" })
  openingBalanceMinor!: string;

  @ApiProperty({ type: "string", description: "Current balance in decimal minor units (exact string).", example: "428000" })
  balanceMinor!: string;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export class Category {
  @ApiProperty({ type: "string", format: "uuid", description: "Category identifier.", example: "3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f" })
  id!: string;

  @ApiProperty({
    type: "string",
    format: "uuid",
    nullable: true,
    description: "Owning user. `null` for built-in system categories (Food, Transport, Bills, Shopping, Health, Entertainment, Education, Other).",
    example: null,
  })
  userId!: string | null;

  @ApiProperty({ type: "string", description: "Category name.", example: "Groceries" })
  name!: string;

  @ApiProperty({ type: "string", enum: ["INCOME", "EXPENSE"], description: "Whether the category applies to income or expense transactions.", example: "EXPENSE" })
  type!: "INCOME" | "EXPENSE";

  @ApiProperty({ type: "boolean", description: "Whether the category is a built-in system category.", example: false })
  isSystem!: boolean;

  @ApiProperty({ type: "string", enum: ["ACTIVE", "ARCHIVED"], description: "Category lifecycle status.", example: "ACTIVE" })
  status!: "ACTIVE" | "ARCHIVED";
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export class Transaction {
  @ApiProperty({ type: "string", format: "uuid", description: "Transaction identifier.", example: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b" })
  id!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Owning user identifier." })
  userId!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Account the transaction belongs to." })
  accountId!: string;

  @ApiProperty({ type: "string", format: "uuid", nullable: true, description: "Linked category. Always `null` for transfers.", example: null })
  categoryId!: string | null;

  @ApiProperty({ type: "string", enum: ["INCOME", "EXPENSE", "TRANSFER"], description: "Transaction type.", example: "EXPENSE" })
  type!: TransactionType;

  @ApiProperty({ type: "string", description: "Amount in decimal minor units. Always positive.", example: "1500" })
  amountMinor!: string;

  @ApiProperty({ type: "string", minLength: 3, maxLength: 3, description: "ISO 4217 currency code, derived from the account.", example: "USD" })
  currencyCode!: string;

  @ApiProperty({ type: "string", nullable: true, description: "Free-form memo.", example: "Lunch at the bistro" })
  description!: string | null;

  @ApiProperty({ type: "string", format: "date", description: "Transaction date (YYYY-MM-DD, UTC).", example: "2026-08-30" })
  transactionDate!: string;

  @ApiProperty({ type: "string", enum: ["ACTIVE", "VOIDED"], description: "Transaction lifecycle status.", example: "ACTIVE" })
  status!: TransactionStatus;

  @ApiProperty({ type: "string", format: "date-time", description: "Persisted transaction creation timestamp." })
  createdAt!: string;

  @ApiProperty({ type: "string", format: "date-time", description: "Persisted transaction update timestamp." })
  updatedAt!: string;

  @ApiPropertyOptional({
    type: "string",
    enum: ["SOURCE", "DESTINATION"],
    nullable: true,
    description: "Present only on transactions created by a transfer: which leg of the transfer this record represents. Omitted for INCOME and EXPENSE transactions.",
    example: null,
  })
  transferDirection?: TransferDirection | null;
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export class Transfer {
  @ApiProperty({ type: "string", format: "uuid", description: "Transfer identifier.", example: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" })
  id!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Owning user identifier." })
  userId!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Identifier of the source (debit) transaction." })
  sourceTransactionId!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Identifier of the destination (credit) transaction." })
  destinationTransactionId!: string;

  @ApiProperty({ type: "string", format: "date-time", description: "Creation timestamp of the transfer record.", example: "2026-08-30T14:32:05.000Z" })
  createdAt!: string;
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export class Budget {
  @ApiProperty({ type: "string", format: "uuid", description: "Budget identifier.", example: "8a9b0c1d-2e3f-4a5b-8c7d-6e5f4a3b2c1d" })
  id!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Budgeted category." })
  categoryId!: string;

  @ApiProperty({ type: "integer", description: "Budget year.", example: 2026 })
  year!: number;

  @ApiProperty({ type: "integer", minimum: 1, maximum: 12, description: "Budget month (1-12).", example: 8 })
  month!: number;

  @ApiProperty({ type: "string", description: "Spending limit in decimal minor units.", example: "300000" })
  limitMinor!: string;

  @ApiProperty({ type: "integer", format: "int64", minimum: 0, description: "Sum of active expenses against this budget in minor units.", example: 230000 })
  spentMinor!: string;

  @ApiProperty({ type: "integer", format: "int64", description: "Remaining budget (`limitMinor - spentMinor`) in minor units.", example: 70000 })
  remainingMinor!: string;

  @ApiProperty({ type: "number", minimum: 0, description: "Share of the limit consumed, as a percentage (can exceed 100 when overspent).", example: 76.67 })
  usagePercentage!: number;

  @ApiProperty({ type: "number", minimum: 0, description: "Alias of `usagePercentage` emitted by the service.", example: 76.67 })
  percentage!: number;

  @ApiProperty({ type: "number", minimum: 0, description: "Alias of `usagePercentage` emitted by the service.", example: 76.67 })
  progressPercent!: number;

  @ApiProperty({ type: "boolean", description: "Whether the spent amount exceeds the limit.", example: false })
  isExceeded!: boolean;

  @ApiProperty({ type: "boolean", description: "Alias of `isExceeded` emitted by the service.", example: false })
  exceeded!: boolean;
}

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------

export class Goal {
  @ApiProperty({ type: "string", format: "uuid", description: "Goal identifier.", example: "4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a" })
  id!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Owning user identifier." })
  userId!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Linked SAVINGS account (one goal per account)." })
  accountId!: string;

  @ApiProperty({ type: "string", description: "Goal name.", example: "Emergency Fund" })
  name!: string;

  @ApiProperty({ type: "integer", format: "int64", minimum: 1, description: "Target amount in minor units.", example: 1200000 })
  targetAmountMinor!: string;

  @ApiProperty({ type: "string", format: "date", nullable: true, description: "Optional target date (YYYY-MM-DD).", example: "2027-12-31" })
  targetDate!: string | null;

  @ApiProperty({ type: "string", enum: ["ACTIVE", "COMPLETED", "ARCHIVED"], description: "Goal lifecycle status. Becomes COMPLETED automatically when progress reaches 100%.", example: "ACTIVE" })
  status!: GoalStatus;

  @ApiProperty({ type: "integer", format: "int64", minimum: 0, description: "Current balance of the linked account in minor units.", example: 540000 })
  currentBalanceMinor!: string;

  @ApiProperty({ type: "number", minimum: 0, maximum: 100, description: "Progress towards the target, 0-100 (never exceeds 100).", example: 45 })
  progressPercentage!: number;

  @ApiProperty({ type: "integer", format: "int64", minimum: 0, description: "Current balance of the linked account in minor units (alias of `currentBalanceMinor`).", example: 540000 })
  currentAmountMinor!: string;

  @ApiProperty({ type: "number", minimum: 0, maximum: 100, description: "Alias of `progressPercentage` emitted by the service.", example: 45 })
  progressPercent!: number;

  @ApiProperty({ type: "string", description: "Display name of the linked SAVINGS account.", example: "Emergency Fund Account" })
  accountName!: string;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export class DashboardBudgetSnapshot {
  @ApiProperty({ type: "string", format: "uuid", description: "Budgeted category." })
  categoryId!: string;

  @ApiProperty({ type: "string", description: "Display name of the budgeted category.", example: "Food" })
  categoryName!: string;

  @ApiProperty({ type: "string", description: "Spending limit in decimal minor units.", example: "300000" })
  limitMinor!: string;

  @ApiProperty({ type: "string", description: "Sum of active expenses against this budget in minor units.", example: "230000" })
  spentMinor!: string;

  @ApiProperty({ type: "string", description: "Remaining budget (`limitMinor - spentMinor`) in minor units.", example: "70000" })
  remainingMinor!: string;

  @ApiProperty({ type: "number", minimum: 0, description: "Share of the limit consumed, as a percentage (capped at 100).", example: 76.67 })
  progressPercent!: number;

  @ApiProperty({ type: "boolean", description: "Whether the spent amount exceeds the limit.", example: false })
  exceeded!: boolean;

  @ApiProperty({ type: "number", minimum: 0, description: "Alias of `progressPercent` emitted by the service.", example: 76.67 })
  percentage!: number;

  @ApiProperty({ type: "boolean", description: "Alias of `exceeded` emitted by the service.", example: false })
  isExceeded!: boolean;

  @ApiPropertyOptional({ type: "number", minimum: 0, description: "Alias of `progressPercent` emitted by the service.", example: 76.67 })
  usagePercentage?: number;
}

export class DashboardGoalSnapshot {
  @ApiProperty({ type: "string", format: "uuid", description: "Goal identifier." })
  id!: string;

  @ApiProperty({ type: "string", description: "Goal name.", example: "Emergency Fund" })
  name!: string;

  @ApiProperty({ type: "string", format: "uuid", description: "Linked SAVINGS account." })
  accountId!: string;

  @ApiProperty({ type: "string", description: "Display name of the linked account.", example: "Savings" })
  accountName!: string;

  @ApiProperty({ type: "string", description: "Target amount in minor units.", example: "1200000" })
  targetAmountMinor!: string;

  @ApiProperty({ type: "string", description: "Current balance of the linked account in minor units.", example: "540000" })
  currentAmountMinor!: string;

  @ApiProperty({ type: "number", minimum: 0, maximum: 100, description: "Progress towards the goal target, 0-100.", example: 45 })
  progressPercent!: number;

  @ApiProperty({ type: "number", minimum: 0, maximum: 100, description: "Alias of `progressPercent` emitted by the service.", example: 45 })
  progressPercentage!: number;

  @ApiProperty({ type: "string", format: "date", nullable: true, description: "Optional target date (YYYY-MM-DD).", example: "2027-12-31" })
  targetDate!: string | null;

  @ApiProperty({ type: "string", enum: ["ACTIVE", "COMPLETED", "ARCHIVED"], description: "Goal lifecycle status.", example: "ACTIVE" })
  status!: GoalStatus;

  @ApiPropertyOptional({ type: "string", description: "Alias of `currentAmountMinor` emitted by the service.", example: "540000" })
  currentBalanceMinor?: string;
}

export class DashboardSummary {
  @ApiProperty({
    type: Object,
    additionalProperties: false,
    description: "Reporting period the summary covers.",
    example: { year: 2026, month: 8 },
  })
  period!: { year: number; month: number };

  @ApiProperty({
    type: Object,
    additionalProperties: false,
    description: "Total balance across all user accounts in minor units.",
    example: { totalMinor: 428000 },
  })
  balances!: { totalMinor: string };

  @ApiProperty({ type: Object, additionalProperties: false, description: "Total income for the period in minor units.", example: { minor: 240000 } })
  income!: { minor: string };

  @ApiProperty({ type: Object, additionalProperties: false, description: "Total expenses for the period in minor units.", example: { minor: 167000 } })
  expenses!: { minor: string };

  @ApiProperty({ type: Object, additionalProperties: false, description: "Savings for the period (`income - expenses`) in minor units.", example: { minor: 73000 } })
  savings!: { minor: string };

  @ApiProperty({ type: () => DashboardBudgetSnapshot, isArray: true, description: "Budgets defined for the selected period.", example: [] })
  budgets!: DashboardBudgetSnapshot[];

  @ApiProperty({ type: () => DashboardGoalSnapshot, isArray: true, description: "Savings goals with their current progress.", example: [] })
  goals!: DashboardGoalSnapshot[];
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export class HealthPayload {
  @ApiProperty({ type: "string", enum: ["ok"], example: "ok" })
  status!: "ok";

  @ApiProperty({
    type: "string",
    enum: ["ok", "disabled"],
    required: false,
    description: "Database readiness detail for the readiness endpoint.",
    example: "ok",
  })
  database?: "ok" | "disabled";
}

// ---------------------------------------------------------------------------
// `{ data: ... }` response wrappers
// ---------------------------------------------------------------------------

export class EmptyResponse {
  @ApiProperty({ type: Object, additionalProperties: false, description: "Empty payload object.", example: {} })
  data!: Record<string, never>;
}

export class HealthResponse {
  @ApiProperty({ type: () => HealthPayload })
  data!: HealthPayload;
}

export class SessionResponse {
  @ApiProperty({ type: () => UserSession })
  data!: UserSession;
}

export class UserProfileResponse {
  @ApiProperty({ type: () => UserProfile })
  data!: UserProfile;
}

export class AccountResponse {
  @ApiProperty({ type: () => Account })
  data!: Account;
}

export class AccountListResponse {
  @ApiProperty({ type: () => Account, isArray: true })
  data!: Account[];

  @ApiProperty({ type: () => Meta })
  meta!: Meta;
}

export class CategoryResponse {
  @ApiProperty({ type: () => Category })
  data!: Category;
}

export class CategoryListResponse {
  @ApiProperty({ type: () => Category, isArray: true })
  data!: Category[];

  @ApiProperty({ type: () => Meta })
  meta!: Meta;
}

export class TransactionResponse {
  @ApiProperty({ type: () => Transaction })
  data!: Transaction;
}

export class TransactionListResponse {
  @ApiProperty({ type: () => Transaction, isArray: true })
  data!: Transaction[];

  @ApiProperty({ type: () => Meta })
  meta!: Meta;
}

export class TransferResponse {
  @ApiProperty({ type: () => Transfer })
  transfer!: Transfer;

  @ApiProperty({ type: () => Transaction })
  sourceTx!: Transaction;

  @ApiProperty({ type: () => Transaction })
  destinationTx!: Transaction;
}

export class TransferResponseEnvelope {
  @ApiProperty({ type: () => TransferResponse })
  data!: {
    transfer: Transfer;
    sourceTx: Transaction;
    destinationTx: Transaction;
  };
}

export class BudgetResponse {
  @ApiProperty({ type: () => Budget })
  data!: Budget;
}

export class BudgetListResponse {
  @ApiProperty({ type: () => Budget, isArray: true })
  data!: Budget[];

  @ApiProperty({ type: () => Meta })
  meta!: Meta;
}

export class GoalResponse {
  @ApiProperty({ type: () => Goal })
  data!: Goal;
}

export class GoalListResponse {
  @ApiProperty({ type: () => Goal, isArray: true })
  data!: Goal[];

  @ApiProperty({ type: () => Meta })
  meta!: Meta;
}

export class DashboardResponse {
  @ApiProperty({ type: () => DashboardSummary })
  data!: DashboardSummary;
}

// ---------------------------------------------------------------------------
// Shared error-response helper
//
// The API fails with a consistent envelope (see `packages/contracts`):
//   { "error": { "code": <ErrorCode>, "message": string, "requestId": string } }
// Use in controllers as:  @ApiResponse(apiError(404, "…", "ACCOUNT_NOT_FOUND", "…"))
// ---------------------------------------------------------------------------

export function apiError(
  status: number,
  description: string,
  code: string,
  message: string,
): Record<string, unknown> {
  return {
    status,
    description,
    type: ErrorBody,
    example: {
      error: { code, message, requestId: "req_6d5f1c2e-4a3b-4c5d-8e7f-9a0b1c2d3e4f" },
    },
  };
}

export function validationApiError(message: string): Record<string, unknown> {
  return apiError(
    400,
    "The request body or parameters failed validation. The `message` field contains the validation details.",
    "VALIDATION_ERROR",
    message,
  );
}