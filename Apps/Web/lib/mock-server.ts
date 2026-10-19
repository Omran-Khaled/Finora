// Mock API server — simulates backend responses matching Appendix A contract exactly.
// This is a development fixture: it mimics response/loading/error/pagination only.
// It is NOT a financial engine: it keeps a coherent demo state (balances move,
// budgets reflect ACTIVE expenses, goals track their linked account) so the UI
// can be developed against realistic API-shaped behaviour before integration.

import type {
  Account,
  Budget,
  Category,
  CategoryType,
  ClientErrorCode,
  CreateAccountRequest,
  CreateBudgetRequest,
  CreateCategoryRequest,
  CreateSavingsGoalRequest,
  CreateTransactionRequest,
  CreateTransferRequest,
  DashboardSummary,
  ErrorEnvelope,
  LoginRequest,
  RegisterRequest,
  SavingsGoal,
  Transaction,
  Transfer,
  TransactionFilters,
  UpdateAccountRequest,
  UpdateBudgetRequest,
  UpdateCategoryRequest,
  UpdateProfileRequest,
  UpdateSavingsGoalRequest,
  UpdateTransactionRequest,
  User,
} from './types';
import { isSupportedCurrency } from '@finora/contracts';

// --- Pagination (server envelope parity) ---

// The real API pages every collection at 20 (default) / 100 (max) with the
// `{ data, meta: { nextCursor } }` envelope. The mock mirrors that envelope on
// its `listPage` entry points so the mock and real adapters can share the same
// bounded `collectAllPages` walk. Plain `list()` keeps returning the full array
// for existing callers/tests; adapters use `listPage` + the shared primitive.
export const MOCK_PAGE_DEFAULT = 20;
export const MOCK_PAGE_MAX = 100;

function paginate<T extends { id: string }>(
  items: T[],
  cursor?: string,
  limit?: number,
): { data: T[]; meta: { nextCursor: string | null } } {
  const size = Math.min(Math.max(limit ?? MOCK_PAGE_DEFAULT, 1), MOCK_PAGE_MAX);
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

// --- In-memory store ---

let mockUser: User | null = null;
let mockAccounts: Account[] = [];
let mockTransactions: Transaction[] = [];
let mockTransfers: Transfer[] = [];
let mockCategories: Category[] = [];
let mockBudgets: Budget[] = [];
let mockGoals: SavingsGoal[] = [];
let mockSession: { token: string } | null = null;
const transactionIdempotency = new Map<string, { fingerprint: string; transaction: Transaction }>();
const transferIdempotency = new Map<string, {
  fingerprint: string;
  result: { transfer: Transfer; sourceTx: Transaction; destinationTx: Transaction };
}>();

// --- Coherent demo state across reloads ---
// The auth session is restored from localStorage on reload; without persisting
// the mock store too, the UI would show a signed-in user with empty financial
// state — a misleading demo. This keeps the fixture coherent, nothing more.
const STORE_KEY = 'finora-mock-state-v1';

interface MockState {
  user: User | null;
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  categories: Category[];
  budgets: Budget[];
  goals: SavingsGoal[];
}

function persistState(): void {
  if (typeof window === 'undefined') return;
  try {
    const state: MockState = {
      user: mockUser,
      accounts: mockAccounts,
      transactions: mockTransactions,
      transfers: mockTransfers,
      categories: mockCategories,
      budgets: mockBudgets,
      goals: mockGoals,
    };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode/quota) — in-memory state still works.
  }
}

function coerceMinor(value: unknown): string | null {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return null;
}

function sanitizeAccount(value: unknown): { account: Account | null; repaired: boolean } {
  if (typeof value !== 'object' || value === null) return { account: null, repaired: true };
  const record = value as Record<string, unknown>;
  let repaired = false;
  for (const field of ['openingBalanceMinor', 'balanceMinor'] as const) {
    const coerced = coerceMinor(record[field]);
    if (coerced === null) return { account: null, repaired: true };
    if (coerced !== record[field]) {
      record[field] = coerced;
      repaired = true;
    }
  }
  return { account: record as unknown as Account, repaired };
}

function sanitizeTransaction(value: unknown): { tx: Transaction | null; repaired: boolean } {
  if (typeof value !== 'object' || value === null) return { tx: null, repaired: true };
  const record = value as Record<string, unknown>;
  const coerced = coerceMinor(record['amountMinor']);
  if (coerced === null) return { tx: null, repaired: true };
  const repaired = coerced !== record['amountMinor'];
  if (repaired) record['amountMinor'] = coerced;
  return { tx: record as unknown as Transaction, repaired };
}

function restoreState(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw) as MockState;
    mockUser = state.user ?? null;
    const rawAccounts = Array.isArray(state.accounts) ? state.accounts : [];
    const cleanAccounts: Account[] = [];
    let repaired = false;
    for (const candidate of rawAccounts) {
      const { account, repaired: itemRepaired } = sanitizeAccount(candidate);
      if (itemRepaired) repaired = true;
      if (account) cleanAccounts.push(account);
    }
    if (cleanAccounts.length !== rawAccounts.length) repaired = true;
    mockAccounts = cleanAccounts;
    const rawTransactions = Array.isArray(state.transactions) ? state.transactions : [];
    const cleanTransactions: Transaction[] = [];
    for (const candidate of rawTransactions) {
      const { tx, repaired: itemRepaired } = sanitizeTransaction(candidate);
      if (itemRepaired) repaired = true;
      if (tx) cleanTransactions.push(tx);
    }
    if (cleanTransactions.length !== rawTransactions.length) repaired = true;
    mockTransactions = cleanTransactions;
    mockTransfers = Array.isArray(state.transfers) ? state.transfers : [];
    mockCategories = Array.isArray(state.categories) ? state.categories : [];
    mockBudgets = Array.isArray(state.budgets) ? state.budgets : [];
    mockGoals = Array.isArray(state.goals) ? state.goals : [];
    if (repaired) persistState();
  } catch {
    // Corrupted fixture — start fresh rather than serving broken state.
    mockUser = null;
    mockAccounts = [];
    mockTransactions = [];
    mockTransfers = [];
    mockCategories = [];
    mockBudgets = [];
    mockGoals = [];
  }
}

restoreState();

// Simulated network delay (0 under test so suites stay fast)
const DELAY = process.env.VITEST ? 0 : 350;
function delay(ms: number = DELAY): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Helpers ---

function genId(): string {
  return 'mock-' + Math.random().toString(36).slice(2, 11);
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function minor(value: string | number): bigint {
  return BigInt(value);
}

function minorText(value: bigint): string {
  return value.toString();
}

// Checks a YYYY-MM-DD date falls in the given year/month.
function sameMonth(dateStr: string, year: number, month: number): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function errorResponse(code: ClientErrorCode, message: string): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      requestId: 'req_' + Math.random().toString(36).slice(2, 10),
    },
  };
}

// --- Auth ---

function makeUser(email: string, baseCurrency = 'USD'): User {
  return {
    id: genId(),
    email: email.toLowerCase(),
    baseCurrency,
    createdAt: now(),
    updatedAt: now(),
  };
}

export const mockAuth = {
  async register(req: RegisterRequest): Promise<{ data: User; token: string }> {
    await delay();
    const baseCurrency = (req.baseCurrency || 'USD').toUpperCase();
    if (!isSupportedCurrency(baseCurrency)) throw errorResponse('INVALID_CURRENCY', 'Unsupported currency.');
    mockUser = makeUser(req.email, baseCurrency);
    // The backend owns system categories — they exist from registration on.
    seedSystemCategories();
    mockSession = { token: 'mock-token-' + Date.now() };
    persistState();
    return { data: mockUser, token: mockSession.token };
  },

  async login(req: LoginRequest): Promise<{ data: User; token: string }> {
    await delay();
    if (!mockUser) {
      mockUser = makeUser(req.email);
      seedSystemCategories();
    }
    mockSession = { token: 'mock-token-' + Date.now() };
    persistState();
    return { data: mockUser, token: mockSession.token };
  },

  async logout(): Promise<void> {
    await delay(150);
    mockSession = null;
  },

  // Session refresh (A-003): the server revokes the previous token and issues a
  // new one; the mock fixture mirrors that by rotating its session token.
  async refresh(): Promise<{ data: User; token: string }> {
    await delay(150);
    if (!mockUser || !mockSession) throw errorResponse('UNAUTHORIZED', 'Not authenticated');
    mockSession = { token: 'mock-token-' + Date.now() };
    persistState();
    return { data: mockUser, token: mockSession.token };
  },

  async me(): Promise<User | null> {
    await delay(150);
    return mockUser;
  },

  async updateProfile(req: UpdateProfileRequest): Promise<User> {
    await delay();
    if (!mockUser) throw errorResponse('UNAUTHORIZED', 'Not authenticated');
    if (req.baseCurrency && !isSupportedCurrency(req.baseCurrency)) throw errorResponse('INVALID_CURRENCY', 'Unsupported currency.');
    // Base currency is locked once accounts exist — all MVP accounts share the
    // user's base currency, so changing it would make balances inconsistent.
    if (req.baseCurrency && req.baseCurrency !== mockUser.baseCurrency) {
      if (mockAccounts.length > 0) {
        throw errorResponse(
          'BASE_CURRENCY_LOCKED',
          'Your base currency cannot be changed because you already have accounts. All accounts use your base currency.'
        );
      }
      mockUser.baseCurrency = req.baseCurrency;
    }
    mockUser.updatedAt = now();
    persistState();
    return mockUser;
  },

  reset(): void {
    mockUser = null;
    mockAccounts = [];
    mockTransactions = [];
    mockTransfers = [];
    mockCategories = [];
    mockBudgets = [];
    mockGoals = [];
    mockSession = null;
    transactionIdempotency.clear();
    transferIdempotency.clear();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORE_KEY);
      } catch {
        // Storage unavailable — nothing to clear.
      }
    }
  },
};

// --- Accounts ---

export const mockAccountsApi = {
  async list(): Promise<Account[]> {
    await delay();
    return [...mockAccounts];
  },

  async listPage(cursor?: string, limit?: number): Promise<{
    data: Account[];
    meta: { nextCursor: string | null };
  }> {
    await delay();
    return paginate([...mockAccounts], cursor, limit);
  },

  async create(req: CreateAccountRequest): Promise<Account> {
    await delay();
    // Single-currency MVP: every account must use the user's base currency.
    if (mockUser && req.currencyCode !== mockUser.baseCurrency) {
      throw errorResponse(
        'INVALID_CURRENCY',
        'Accounts must use your base currency (' + mockUser.baseCurrency + ').'
      );
    }
    const account: Account = {
      id: genId(),
      userId: mockUser?.id ?? '',
      name: req.name,
      type: req.type,
      currencyCode: req.currencyCode,
      openingBalanceMinor: String(req.openingBalanceMinor),
      balanceMinor: String(req.openingBalanceMinor),
      status: 'ACTIVE',
      createdAt: now(),
      updatedAt: now(),
    };
    mockAccounts.push(account);
    persistState();
    return account;
  },

  async get(id: string): Promise<Account | undefined> {
    await delay();
    return mockAccounts.find((a) => a.id === id);
  },

  async update(id: string, req: UpdateAccountRequest): Promise<Account> {
    await delay();
    const account = mockAccounts.find((a) => a.id === id);
    if (!account) throw errorResponse('ACCOUNT_NOT_FOUND', 'Account not found');
    if (req.name) account.name = req.name;
    account.updatedAt = now();
    persistState();
    return account;
  },

  async archive(id: string): Promise<Account> {
    await delay();
    const account = mockAccounts.find((a) => a.id === id);
    if (!account) throw errorResponse('ACCOUNT_NOT_FOUND', 'Account not found');
    if (mockGoals.some((goal) => goal.accountId === id && goal.status === 'ACTIVE')) {
      throw errorResponse('ACCOUNT_HAS_ACTIVE_GOAL', 'An account with an active savings goal cannot be archived.');
    }
    if (account.status === 'ARCHIVED') throw errorResponse('ACCOUNT_ARCHIVED', 'Account is already archived');
    account.status = 'ARCHIVED';
    account.updatedAt = now();
    persistState();
    return account;
  },
};

// --- Categories ---

export const mockCategoriesApi = {
  async list(): Promise<Category[]> {
    await delay();
    return [...mockCategories];
  },

  async listPage(cursor?: string, limit?: number): Promise<{
    data: Category[];
    meta: { nextCursor: string | null };
  }> {
    await delay();
    return paginate([...mockCategories], cursor, limit);
  },

  async create(req: CreateCategoryRequest): Promise<Category> {
    await delay();
    const category: Category = {
      id: genId(),
      userId: mockUser?.id ?? null,
      name: req.name,
      type: req.type,
      isSystem: false,
      status: 'ACTIVE',
      createdAt: now(),
      updatedAt: now(),
    };
    mockCategories.push(category);
    return category;
  },

  async update(id: string, req: UpdateCategoryRequest): Promise<Category> {
    await delay();
    const cat = mockCategories.find((c) => c.id === id);
    if (!cat) throw errorResponse('CATEGORY_NOT_FOUND', 'Category not found');
    if (req.name) cat.name = req.name;
    cat.updatedAt = now();
    return cat;
  },

  async archive(id: string): Promise<Category> {
    await delay();
    const cat = mockCategories.find((c) => c.id === id);
    if (!cat) throw errorResponse('CATEGORY_NOT_FOUND', 'Category not found');
    cat.status = 'ARCHIVED';
    cat.updatedAt = now();
    return cat;
  },
};

// --- Transactions ---

export const mockTransactionsApi = {
  async list(filters: TransactionFilters = {}): Promise<{
    data: Transaction[];
    meta: { nextCursor: string | null };
  }> {
    await delay();
    let result = [...mockTransactions];

    if (filters.accountId) result = result.filter((t) => t.accountId === filters.accountId);
    if (filters.categoryId) result = result.filter((t) => t.categoryId === filters.categoryId);
    if (filters.type) result = result.filter((t) => t.type === filters.type);
    if (filters.from) result = result.filter((t) => t.transactionDate >= filters.from!);
    if (filters.to) result = result.filter((t) => t.transactionDate <= filters.to!);

    // Sort: newest first (transactionDate DESC)
    result.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));

    // Keyset pagination mirroring the server: an unknown/stale cursor ends the
    // sequence with an empty page (never resumes from the start).
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    let startIndex = 0;
    if (filters.cursor) {
      const cursorIndex = result.findIndex((t) => t.id === filters.cursor);
      if (cursorIndex === -1) return { data: [], meta: { nextCursor: null } };
      startIndex = cursorIndex + 1;
    }
    const window = result.slice(startIndex, startIndex + limit + 1);
    const page = window.slice(0, limit);
    const nextCursor =
      window.length > limit ? (page[page.length - 1]?.id ?? null) : null;

    return { data: page, meta: { nextCursor } };
  },

  async create(req: CreateTransactionRequest, idempotencyKey: string): Promise<Transaction> {
    await delay();
    const fingerprint = JSON.stringify(req);
    if (idempotencyKey) {
      const existing = transactionIdempotency.get(idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw errorResponse('DUPLICATE_REQUEST', 'The idempotency key cannot be reused with different financial data.');
        return existing.transaction;
      }
    }
    const account = mockAccounts.find((a) => a.id === req.accountId);
    if (!account) throw errorResponse('ACCOUNT_NOT_FOUND', 'Account not found');
    if (account.status === 'ARCHIVED')
      throw errorResponse('ACCOUNT_ARCHIVED', 'This account is archived.');

    // BR-003: Expense requires category
    if (req.type === 'EXPENSE' && !req.categoryId)
      throw errorResponse('VALIDATION_ERROR', 'Expense requires a category.');

    if (req.categoryId) {
      const category = mockCategories.find((c) => c.id === req.categoryId);
      if (!category) throw errorResponse('CATEGORY_NOT_FOUND', 'Category not found');
      if (category.status === 'ARCHIVED') throw errorResponse('CATEGORY_ARCHIVED', 'This category is archived.');
      if (category.userId !== null && category.userId !== mockUser?.id)
        throw errorResponse('CATEGORY_NOT_FOUND', 'Category not found');
      if (category.type !== req.type)
        throw errorResponse('INVALID_CATEGORY_TYPE', 'Category type does not match transaction type.');
    }

    // BR-002: Amount must be positive
    if (minor(req.amountMinor) <= 0n)
      throw errorResponse('INVALID_AMOUNT', 'Amount must be positive.');

    if (req.type === 'EXPENSE' && minor(account.balanceMinor) < minor(req.amountMinor))
      throw errorResponse('INSUFFICIENT_FUNDS', 'The account balance is insufficient for this transaction.');

    const transaction: Transaction = {
      id: genId(),
      userId: mockUser?.id ?? '',
      accountId: req.accountId,
      categoryId: req.categoryId ?? null,
      type: req.type,
      amountMinor: String(req.amountMinor),
      currencyCode: account.currencyCode,
      description: req.description ?? null,
      transactionDate: req.transactionDate,
      status: 'ACTIVE',
      transferDirection: null,
      createdAt: now(),
      updatedAt: now(),
    };
    mockTransactions.push(transaction);
    if (idempotencyKey) transactionIdempotency.set(idempotencyKey, { fingerprint, transaction });

    // Keep the demo state coherent: the account balance reflects the operation.
    // INCOME increases the balance, EXPENSE decreases it. Transfers are created
    // through the transfers API, which moves both accounts itself.
    if (req.type === 'INCOME') {
      account.balanceMinor = minorText(minor(account.balanceMinor) + minor(req.amountMinor));
      account.updatedAt = now();
    } else if (req.type === 'EXPENSE') {
      account.balanceMinor = minorText(minor(account.balanceMinor) - minor(req.amountMinor));
      account.updatedAt = now();
    }

    persistState();
    return transaction;
  },

  async get(id: string): Promise<Transaction | undefined> {
    await delay();
    return mockTransactions.find((t) => t.id === id);
  },

  async update(id: string, req: UpdateTransactionRequest): Promise<Transaction> {
    await delay();
    const tx = mockTransactions.find((t) => t.id === id);
    if (!tx) throw errorResponse('TRANSACTION_NOT_FOUND', 'Transaction not found');
    if (tx.status === 'VOIDED')
      throw errorResponse('TRANSACTION_ALREADY_VOIDED', 'Voided transactions cannot be edited.');

    if (req.description !== undefined) tx.description = req.description;
    if (req.transactionDate) tx.transactionDate = req.transactionDate;
    tx.updatedAt = now();

    persistState();
    return tx;
  },

  async void(id: string): Promise<Transaction> {
    await delay();
    const tx = mockTransactions.find((t) => t.id === id);
    if (!tx) throw errorResponse('TRANSACTION_NOT_FOUND', 'Transaction not found');
    if (tx.status === 'VOIDED')
      throw errorResponse('TRANSACTION_ALREADY_VOIDED', 'Transaction is already voided.');
    tx.status = 'VOIDED';
    tx.updatedAt = now();

    // A voided transaction no longer affects financial results: reverse its
    // original balance effect. The record itself is preserved (no hard delete).
    const account = mockAccounts.find((a) => a.id === tx.accountId);
    if (account) {
      if (tx.type === 'INCOME') account.balanceMinor = minorText(minor(account.balanceMinor) - minor(tx.amountMinor));
      if (tx.type === 'EXPENSE') account.balanceMinor = minorText(minor(account.balanceMinor) + minor(tx.amountMinor));
      account.updatedAt = now();
    }

    persistState();
    return tx;
  },
};

// --- Transfers ---

export const mockTransfersApi = {
  async create(req: CreateTransferRequest, idempotencyKey: string): Promise<{
    transfer: Transfer;
    sourceTx: Transaction;
    destinationTx: Transaction;
  }> {
    await delay();
    const fingerprint = JSON.stringify(req);
    if (idempotencyKey) {
      const existing = transferIdempotency.get(idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw errorResponse('DUPLICATE_REQUEST', 'The idempotency key cannot be reused with different financial data.');
        return existing.result;
      }
    }
    const sourceAccount = mockAccounts.find((a) => a.id === req.fromAccountId);
    const destAccount = mockAccounts.find((a) => a.id === req.toAccountId);

    if (!sourceAccount || !destAccount)
      throw errorResponse('ACCOUNT_NOT_FOUND', 'Account not found');

    // BR-005: Transfer cannot use same account
    if (req.fromAccountId === req.toAccountId)
      throw errorResponse('SAME_ACCOUNT_TRANSFER', 'Source and destination must be different.');

    // FI-004: Cross-currency rejected
    if (sourceAccount.currencyCode !== destAccount.currencyCode)
      throw errorResponse(
        'CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED',
        'Transfers between accounts with different currencies are not supported.'
      );

    if (minor(req.amountMinor) <= 0n)
      throw errorResponse('INVALID_AMOUNT', 'Amount must be positive.');

    // The transfer moves real value: the source must be able to cover it.
    if (minor(sourceAccount.balanceMinor) < minor(req.amountMinor))
      throw errorResponse('INSUFFICIENT_FUNDS', 'The source account does not have enough funds.');

    const createdAt = now();
    const sourceTx: Transaction = {
      id: genId(),
      userId: mockUser?.id ?? '',
      accountId: req.fromAccountId,
      categoryId: null,
      type: 'TRANSFER',
      amountMinor: String(req.amountMinor),
      currencyCode: sourceAccount.currencyCode,
      description: 'Transfer to ' + destAccount.name,
      transactionDate: req.transactionDate,
      status: 'ACTIVE',
      transferDirection: 'SOURCE',
      createdAt,
      updatedAt: createdAt,
    };
    const destTx: Transaction = {
      id: genId(),
      userId: mockUser?.id ?? '',
      accountId: req.toAccountId,
      categoryId: null,
      type: 'TRANSFER',
      amountMinor: String(req.amountMinor),
      currencyCode: destAccount.currencyCode,
      description: 'Transfer from ' + sourceAccount.name,
      transactionDate: req.transactionDate,
      status: 'ACTIVE',
      transferDirection: 'DESTINATION',
      createdAt,
      updatedAt: createdAt,
    };
    mockTransactions.push(sourceTx, destTx);

    // Source decreases, destination increases. Transfers are neither income
    // nor expense and never touch totals derived from those types.
    sourceAccount.balanceMinor = minorText(minor(sourceAccount.balanceMinor) - minor(req.amountMinor));
    destAccount.balanceMinor = minorText(minor(destAccount.balanceMinor) + minor(req.amountMinor));
    sourceAccount.updatedAt = now();
    destAccount.updatedAt = now();

    const transfer: Transfer = {
      id: genId(),
      userId: mockUser?.id ?? '',
      sourceTransactionId: sourceTx.id,
      destinationTransactionId: destTx.id,
      createdAt,
    };
    mockTransfers.push(transfer);
    persistState();
    const result = { transfer, sourceTx, destinationTx: destTx };
    if (idempotencyKey) transferIdempotency.set(idempotencyKey, { fingerprint, result });
    return result;
  },

  // Resolves a transfer from its own id OR from either linked transaction id,
  // so the transaction detail screen can open the full transfer picture.
  async get(id: string): Promise<Transfer | undefined> {
    await delay();
    return mockTransfers.find(
      (t) =>
        t.id === id ||
        t.sourceTransactionId === id ||
        t.destinationTransactionId === id
    );
  },
};

// --- Budgets ---

export const mockBudgetsApi = {
  // Budget usage is derived from ACTIVE EXPENSE transactions for the budget's
  // category and month — planning only, it never blocks anything.
  async list(): Promise<Budget[]> {
    await delay();
    return withBudgetUsage(mockBudgets);
  },

  async listPage(cursor?: string, limit?: number): Promise<{
    data: Budget[];
    meta: { nextCursor: string | null };
  }> {
    await delay();
    return paginate(withBudgetUsage(mockBudgets), cursor, limit);
  },

  async create(req: CreateBudgetRequest): Promise<Budget> {
    await delay();
    // UNIQUE(user_id, category_id, year, month)
    const existing = mockBudgets.find(
      (b) =>
        b.categoryId === req.categoryId &&
        b.year === req.year &&
        b.month === req.month
    );
    if (existing)
      throw errorResponse('BUDGET_ALREADY_EXISTS', 'A budget for this category and month already exists.');

    const budget: Budget = {
      id: genId(),
      userId: mockUser?.id ?? '',
      categoryId: req.categoryId,
      year: req.year,
      month: req.month,
      limitMinor: String(req.limitMinor),
      spentMinor: '0',
      remainingMinor: String(req.limitMinor),
      createdAt: now(),
      updatedAt: now(),
    };
    mockBudgets.push(budget);
    persistState();
    // Return the canonical view (derived usage aliases), exactly like
    // POST /budgets on the real API.
    return withBudgetUsage([budget])[0];
  },

  async update(id: string, req: UpdateBudgetRequest): Promise<Budget> {
    await delay();
    const budget = mockBudgets.find((b) => b.id === id);
    if (!budget) throw errorResponse('BUDGET_NOT_FOUND', 'Budget not found');
    budget.limitMinor = String(req.limitMinor);
    const spent = mockTransactions
      .filter(
        (t) =>
          t.status === 'ACTIVE' &&
          t.type === 'EXPENSE' &&
          t.categoryId === budget.categoryId &&
          sameMonth(t.transactionDate, budget.year, budget.month)
      )
      .reduce((sum, t) => sum + minor(t.amountMinor), 0n);
    budget.spentMinor = minorText(spent);
    budget.remainingMinor = minorText(minor(budget.limitMinor) - spent);
    budget.updatedAt = now();
    persistState();
    return withBudgetUsage([budget])[0];
  },

  async delete(id: string): Promise<void> {
    await delay();
    mockBudgets = mockBudgets.filter((b) => b.id !== id);
    persistState();
  },
};

// --- Savings Goals ---

function withBudgetUsage(rows: Budget[]): Budget[] {
  return rows.map((b) => {
    const spent = mockTransactions
      .filter(
        (t) =>
          t.status === 'ACTIVE' &&
          t.type === 'EXPENSE' &&
          t.categoryId === b.categoryId &&
          sameMonth(t.transactionDate, b.year, b.month)
      )
      .reduce((sum, t) => sum + minor(t.amountMinor), 0n);
    const limit = minor(b.limitMinor);
    // Mirrors BudgetsService.view: the usage aliases are computed from the
    // ACTIVE expenses of that category/month, never a stored snapshot.
    const usagePercentage = limit > 0n
      ? Math.min(Number((spent * 10000n / limit).toString()) / 100, 100)
      : 0;
    const exceeded = spent > limit;
    return {
      ...b,
      spentMinor: minorText(spent),
      remainingMinor: minorText(limit - spent),
      percentage: usagePercentage,
      progressPercent: usagePercentage,
      usagePercentage,
      isExceeded: exceeded,
      exceeded,
    };
  });
}

// Progress comes from the linked account's current balance — the goal has no
// independent balance of its own.
function deriveGoalProgress(goal: SavingsGoal): SavingsGoal {
  const account = mockAccounts.find((a) => a.id === goal.accountId);
  const current = minor(account?.balanceMinor ?? '0');
  const progress =
    minor(goal.targetAmountMinor) > 0n
      ? Math.min(Number((current * 10000n / minor(goal.targetAmountMinor)).toString()) / 100, 100)
      : 0;
  const rounded = Math.round(progress);
  // GoalsService.view emits both progress aliases plus the linked account
  // context; the mock must expose the same canonical fields.
  return {
    ...goal,
    currentAmountMinor: minorText(current),
    currentBalanceMinor: minorText(current),
    accountName: account?.name ?? 'Savings Goal',
    progressPercent: rounded,
    progressPercentage: rounded,
  };
}

export const mockSavingsGoalsApi = {
  // Goal progress is derived from the linked savings account's current state —
  // never a stale snapshot, so a transfer into savings is reflected immediately.
  async list(): Promise<SavingsGoal[]> {
    await delay();
    return mockGoals.map(deriveGoalProgress);
  },

  async listPage(cursor?: string, limit?: number): Promise<{
    data: SavingsGoal[];
    meta: { nextCursor: string | null };
  }> {
    await delay();
    return paginate(mockGoals.map(deriveGoalProgress), cursor, limit);
  },

  async create(req: CreateSavingsGoalRequest): Promise<SavingsGoal> {
    await delay();
    const account = mockAccounts.find((a) => a.id === req.accountId);
    if (!account) throw errorResponse('ACCOUNT_NOT_FOUND', 'Account not found');

    const goal: SavingsGoal = {
      id: genId(),
      userId: mockUser?.id ?? '',
      accountId: req.accountId,
      name: req.name,
      targetAmountMinor: String(req.targetAmountMinor),
      targetDate: req.targetDate ?? null,
      status: 'ACTIVE',
      progressPercent: 0,
      currentAmountMinor: account.balanceMinor,
      createdAt: now(),
      updatedAt: now(),
    };
    mockGoals.push(goal);
    persistState();
    return deriveGoalProgress(goal);
  },

  async get(id: string): Promise<SavingsGoal | undefined> {
    await delay();
    const goal = mockGoals.find((g) => g.id === id);
    return goal ? deriveGoalProgress(goal) : undefined;
  },

  async update(id: string, req: UpdateSavingsGoalRequest): Promise<SavingsGoal> {
    await delay();
    const goal = mockGoals.find((g) => g.id === id);
    if (!goal) throw errorResponse('GOAL_NOT_FOUND', 'Savings goal not found');
    // Rename-only, matching PATCH /savings-goals/:id on the real API:
    // targetAmountMinor/targetDate are create-only and rejected there.
    if (req.name) goal.name = req.name;
    goal.updatedAt = now();
    persistState();
    return deriveGoalProgress(goal);
  },

  async archive(id: string): Promise<SavingsGoal> {
    await delay();
    const goal = mockGoals.find((g) => g.id === id);
    if (!goal) throw errorResponse('GOAL_NOT_FOUND', 'Savings goal not found');
    if (goal.status === 'ARCHIVED')
      throw errorResponse('GOAL_ALREADY_ARCHIVED', 'Goal is already archived.');
    goal.status = 'ARCHIVED';
    goal.updatedAt = now();
    persistState();
    return deriveGoalProgress(goal);
  },
};

// --- Dashboard ---

export const mockDashboardApi = {
  async getSummary(): Promise<DashboardSummary> {
    await delay();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const totalMinor = mockAccounts
      .filter((a) => a.status === 'ACTIVE')
      .reduce((sum, a) => sum + minor(a.balanceMinor), 0n);

    const monthTransactions = mockTransactions.filter((t) => {
      const d = new Date(t.transactionDate + 'T00:00:00');
      return (
        d.getFullYear() === year &&
        d.getMonth() + 1 === month &&
        t.status === 'ACTIVE'
      );
    });

    const income = monthTransactions
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + minor(t.amountMinor), 0n);

    const expenses = monthTransactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + minor(t.amountMinor), 0n);

    const savings = income - expenses;

    const budgets = mockBudgets
      .filter((b) => b.year === year && b.month === month)
      .map((b) => {
        const category = mockCategories.find((c) => c.id === b.categoryId);
        const spent = monthTransactions
          .filter((t) => t.categoryId === b.categoryId && t.type === 'EXPENSE')
          .reduce((sum, t) => sum + minor(t.amountMinor), 0n);
        const remaining = minor(b.limitMinor) - spent;
        const progress = minor(b.limitMinor) > 0n
          ? Number((spent * 10000n / minor(b.limitMinor)).toString()) / 100
          : 0;
        const progressPercent = Math.min(progress, 100);
        const exceeded = spent > minor(b.limitMinor);
        return {
          categoryId: b.categoryId,
          categoryName: category?.name ?? 'Unknown',
          limitMinor: b.limitMinor,
          spentMinor: minorText(spent),
          remainingMinor: minorText(remaining),
          progressPercent,
          exceeded,
          percentage: progressPercent,
          isExceeded: exceeded,
          // The real API emits every alias pair; keep mock parity.
          usagePercentage: progressPercent,
        };
      });

    const goals = mockGoals
      // GET /dashboard/summary only reports ACTIVE goals (see DashboardService).
      .filter((g) => g.status === 'ACTIVE')
      .map((g) => {
        const account = mockAccounts.find((a) => a.id === g.accountId);
        const current = minor(account?.balanceMinor ?? '0');
        const progress = minor(g.targetAmountMinor) > 0n
          ? Number((current * 10000n / minor(g.targetAmountMinor)).toString()) / 100
          : 0;
        const progressPercent = Math.min(progress, 100);
        return {
          id: g.id,
          name: g.name,
          accountId: g.accountId,
          accountName: account?.name ?? 'Savings Goal',
          targetAmountMinor: g.targetAmountMinor,
          currentAmountMinor: minorText(current),
          // The real API emits every alias pair; keep mock parity.
          currentBalanceMinor: minorText(current),
          progressPercent,
          progressPercentage: progressPercent,
          targetDate: g.targetDate,
          status: g.status,
        };
      });

    return {
      period: { year, month },
      balances: { totalMinor: minorText(totalMinor) },
      income: { minor: minorText(income) },
      expenses: { minor: minorText(expenses) },
      savings: { minor: minorText(savings) },
      budgets,
      goals,
    };
  },
};

// --- Seed system categories (called after register) ---

export function seedSystemCategories(): void {
  const systemDefs: { name: string; type: CategoryType }[] = [
    { name: 'Food', type: 'EXPENSE' },
    { name: 'Transport', type: 'EXPENSE' },
    { name: 'Bills', type: 'EXPENSE' },
    { name: 'Shopping', type: 'EXPENSE' },
    { name: 'Health', type: 'EXPENSE' },
    { name: 'Entertainment', type: 'EXPENSE' },
    { name: 'Education', type: 'EXPENSE' },
    { name: 'Other', type: 'EXPENSE' },
  ];
  const systemCats: Category[] = systemDefs.map((c) => ({
    id: 'sys-' + c.name.toLowerCase(),
    userId: null,
    name: c.name,
    type: c.type,
    isSystem: true,
    status: 'ACTIVE' as const,
    createdAt: now(),
    updatedAt: now(),
  }));
  mockCategories = systemCats;
  persistState();
}

// --- Seed demo data for testing ---

export function seedDemoData(): void {
  if (!mockUser) return;

  // Accounts
  const mainBank: Account = {
    id: 'demo-bank',
    userId: mockUser.id,
    name: 'Main Bank',
    type: 'BANK',
    currencyCode: mockUser.baseCurrency,
    openingBalanceMinor: '200000',
    balanceMinor: '270000',
    status: 'ACTIVE',
    createdAt: now(),
    updatedAt: now(),
  };
  const cash: Account = {
    id: 'demo-cash',
    userId: mockUser.id,
    name: 'Cash',
    type: 'CASH',
    currencyCode: mockUser.baseCurrency,
    openingBalanceMinor: '50000',
    balanceMinor: '58000',
    status: 'ACTIVE',
    createdAt: now(),
    updatedAt: now(),
  };
  const savings: Account = {
    id: 'demo-savings',
    userId: mockUser.id,
    name: 'Savings',
    type: 'SAVINGS',
    currencyCode: mockUser.baseCurrency,
    openingBalanceMinor: '100000',
    balanceMinor: '100000',
    status: 'ACTIVE',
    createdAt: now(),
    updatedAt: now(),
  };
  mockAccounts = [mainBank, cash, savings];

  // Transactions
  const foodCat = mockCategories.find((c) => c.name === 'Food')!;
  const transportCat = mockCategories.find((c) => c.name === 'Transport')!;
  const billsCat = mockCategories.find((c) => c.name === 'Bills')!;

  mockTransactions = [
    {
      id: 'demo-tx-1',
      userId: mockUser.id,
      accountId: mainBank.id,
      categoryId: foodCat.id,
      type: 'EXPENSE',
      amountMinor: '1500',
      currencyCode: 'USD',
      description: 'Lunch at cafe',
      transactionDate: today(),
      status: 'ACTIVE',
      transferDirection: null,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'demo-tx-2',
      userId: mockUser.id,
      accountId: mainBank.id,
      categoryId: null,
      type: 'INCOME',
      amountMinor: '240000',
      currencyCode: 'USD',
      description: 'Salary',
      transactionDate: today(),
      status: 'ACTIVE',
      transferDirection: null,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'demo-tx-3',
      userId: mockUser.id,
      accountId: cash.id,
      categoryId: transportCat.id,
      type: 'EXPENSE',
      amountMinor: '2000',
      currencyCode: 'USD',
      description: 'Taxi',
      transactionDate: today(),
      status: 'ACTIVE',
      transferDirection: null,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'demo-tx-4',
      userId: mockUser.id,
      accountId: mainBank.id,
      categoryId: billsCat.id,
      type: 'EXPENSE',
      amountMinor: '8000',
      currencyCode: 'USD',
      description: 'Electricity bill',
      transactionDate: today(),
      status: 'ACTIVE',
      transferDirection: null,
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  // Budgets
  mockBudgets = [
    {
      id: 'demo-budget-1',
      userId: mockUser.id,
      categoryId: foodCat.id,
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      limitMinor: '30000',
      spentMinor: '21600',
      remainingMinor: '8400',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'demo-budget-2',
      userId: mockUser.id,
      categoryId: transportCat.id,
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      limitMinor: '20000',
      spentMinor: '9600',
      remainingMinor: '10400',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'demo-budget-3',
      userId: mockUser.id,
      categoryId: billsCat.id,
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      limitMinor: '15000',
      spentMinor: '12450',
      remainingMinor: '2550',
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  // Savings goals
  mockGoals = [
    {
      id: 'demo-goal-1',
      userId: mockUser.id,
      accountId: savings.id,
      name: 'Laptop',
      targetAmountMinor: '120000',
      targetDate: '2027-06-01',
      status: 'ACTIVE',
      progressPercent: 45,
      currentAmountMinor: '54000',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'demo-goal-2',
      userId: mockUser.id,
      accountId: savings.id,
      name: 'Emergency Fund',
      targetAmountMinor: '300000',
      targetDate: null,
      status: 'ACTIVE',
      progressPercent: 33,
      currentAmountMinor: '100000',
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  persistState();
}
