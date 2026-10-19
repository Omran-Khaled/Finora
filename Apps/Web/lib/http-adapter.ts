// Real HTTP adapter — the production implementation of the ApiClient contract.
// It mirrors the mock adapter's shapes exactly: same inputs, same resolved
// values, errors thrown as ErrorEnvelope-shaped objects. Auth uses the bearer
// token returned by the API and keeps it in the browser session.
import type {
  Account,
  Budget,
  Category,
  CollectionEnvelope,
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
  SuccessEnvelope,
  Transaction,
  TransactionFilters,
  Transfer,
  TransferCreationResult,
  UpdateAccountRequest,
  UpdateBudgetRequest,
  UpdateCategoryRequest,
  UpdateProfileRequest,
  UpdateSavingsGoalRequest,
  UpdateTransactionRequest,
  User,
} from './types';
import { readToken, writeToken } from './session-store';
import { collectAllPages, COLLECTION_PAGE_LIMIT } from './pagination';

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchOnce(path: string, init?: RequestInit): Promise<Response> {
  const requestId = `web_${crypto.randomUUID()}`;
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
  headers.set('X-Request-Id', headers.get('X-Request-Id') ?? requestId);
  const token = readToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const mergedHeaders = new Headers(headers);
  if (token && !mergedHeaders.has('Authorization')) {
    mergedHeaders.set('Authorization', `Bearer ${token}`);
  }

  const headerObject: Record<string, string> = {};
  for (const [key, value] of mergedHeaders.entries()) {
    const prettyKey =
      key === 'authorization'
        ? 'Authorization'
        : key === 'content-type'
          ? 'Content-Type'
          : key === 'x-request-id'
            ? 'X-Request-Id'
            : key === 'idempotency-key'
              ? 'Idempotency-Key'
              : key;
    headerObject[prettyKey] = value;
  }

  const requestInit: RequestInit = {
    credentials: 'omit',
    ...init,
    headers: headerObject,
  };

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(init?.signal?.reason);
  if (init?.signal) {
    if (init.signal.aborted) {
      abortFromCaller();
    } else {
      init.signal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...requestInit,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) throw new Error('Request timed out');
    throw error;
  } finally {
    clearTimeout(timeoutId);
    init?.signal?.removeEventListener('abort', abortFromCaller);
  }
}

async function throwResponseError(res: Response): Promise<never> {
  let envelope: ErrorEnvelope | null = null;
  try {
    envelope = (await res.json()) as ErrorEnvelope;
  } catch {
    // Non-JSON error body — fall through to the generic envelope below.
  }
  throw (
    envelope ?? {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request could not be completed. Please try again.',
        requestId: 'unknown',
      },
    }
  );
}

/**
 * Exchanges the current bearer token for a fresh one. The server revokes the old
 * token, so the new one must be persisted immediately.
 */
let refreshInFlight: Promise<{ data: User; token: string }> | null = null;

async function refreshSession(): Promise<{ data: User; token: string }> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const env = await request<SuccessEnvelope<{ token: string; user: User }>>('/auth/refresh', {
        method: 'POST',
      });
      writeToken(env.data.token);
      return { data: env.data.user, token: env.data.token };
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const canRetry = method === 'GET';
  let res: Response;

  try {
    res = await fetchOnce(path, init);
  } catch (error) {
    // GET-only: one safe retry on transient network failure.
    if (!canRetry) throw error;
    res = await fetchOnce(path, init);
  }

  // Expired session: refresh once, then replay the original GET exactly once.
  // Never triggered by the refresh call itself, so there is no retry loop.
  if (res.status === 401 && canRetry && path !== '/auth/refresh' && readToken()) {
    await refreshSession();
    res = await fetchOnce(path, init);
  }

  if (!res.ok) return throwResponseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const httpApi = {
  auth: {
    // The server returns `{ data: { token, user } }`. The adapter must resolve the
    // same `{ data: User, token }` shape the mock adapter resolves, so callers
    // (`AuthProvider`) receive the user object and the token is persisted.
    register: (req: RegisterRequest) =>
      request<SuccessEnvelope<{ token: string; user: User }>>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(req),
      }).then((env) => {
        writeToken(env.data.token);
        return { data: env.data.user, token: env.data.token };
      }),
    login: (req: LoginRequest) =>
      request<SuccessEnvelope<{ token: string; user: User }>>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(req),
      }).then((env) => {
        writeToken(env.data.token);
        return { data: env.data.user, token: env.data.token };
      }),
    logout: () =>
      request<void>('/auth/logout', { method: 'POST' }).finally(() => writeToken(null)),
    // Exchanges the current token for a fresh one and persists it (F-012/A-003).
    refresh: () => refreshSession(),
    me: () =>
      request<SuccessEnvelope<User | null>>('/auth/me').then((env) => env.data),
    updateProfile: (req: UpdateProfileRequest) =>
      request<SuccessEnvelope<User>>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(req),
      }).then((env) => env.data),
  },

  accounts: {
    // Bounded full-collection read matching the mock adapter: walk every page
    // (at most COLLECTION_MAX_PAGES) so lists render in full. Transactions keep
    // explicit cursor paging in the UI.
    list: async () => {
      const page = (cursor: string | undefined) =>
        request<CollectionEnvelope<Account>>(
          `/accounts${query({ limit: COLLECTION_PAGE_LIMIT, cursor })}`
        );
      return (await collectAllPages(page)).items;
    },
    create: (req: CreateAccountRequest) =>
      request<SuccessEnvelope<Account>>('/accounts', {
        method: 'POST',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    get: (id: string) =>
      request<SuccessEnvelope<Account>>(`/accounts/${id}`).then((env) => env.data),
    update: (id: string, req: UpdateAccountRequest) =>
      request<SuccessEnvelope<Account>>(`/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    archive: (id: string) =>
      request<SuccessEnvelope<Account>>(`/accounts/${id}/archive`, {
        method: 'POST',
      }).then((env) => env.data),
  },

  transactions: {
    list: (filters: TransactionFilters = {}) =>
      request<CollectionEnvelope<Transaction>>(
        `/transactions${query({
          accountId: filters.accountId,
          categoryId: filters.categoryId,
          type: filters.type,
          from: filters.from,
          to: filters.to,
          cursor: filters.cursor,
          limit: filters.limit,
        })}`
      ).then((env) => ({ data: env.data, meta: env.meta })),
    create: (req: CreateTransactionRequest, idempotencyKey: string) =>
      request<SuccessEnvelope<Transaction>>('/transactions', {
        method: 'POST',
        body: JSON.stringify(req),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }).then((env) => env.data),
    get: (id: string) =>
      request<SuccessEnvelope<Transaction>>(`/transactions/${id}`).then(
        (env) => env.data
      ),
    update: (id: string, req: UpdateTransactionRequest) =>
      request<SuccessEnvelope<Transaction>>(`/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    void: (id: string) =>
      request<SuccessEnvelope<Transaction>>(`/transactions/${id}/void`, {
        method: 'POST',
      }).then((env) => env.data),
  },
  transfers: {
    create: (req: CreateTransferRequest, idempotencyKey: string) =>
      request<SuccessEnvelope<TransferCreationResult>>('/transfers', {
        method: 'POST',
        body: JSON.stringify(req),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }).then((env) => env.data),
    // Resolves by transfer id or either linked transaction id, matching the
    // mock adapter so the transfer detail screen works identically.
    // X-001(c): a missing transfer must surface as the documented 404 envelope,
    // not as `undefined`, so callers can render an error state instead of
    // silently rendering an empty "transfer".
    get: (id: string) =>
      request<SuccessEnvelope<Transfer | null>>(`/transfers/${id}`).then((env) => {
        if (!env.data) {
          throw {
            error: {
              code: 'TRANSACTION_NOT_FOUND',
              message: 'Transfer not found.',
              requestId: 'client',
            },
          } satisfies ErrorEnvelope;
        }
        return env.data;
      }),
  },

  categories: {
    list: async () => {
      const page = (cursor: string | undefined) =>
        request<CollectionEnvelope<Category>>(
          `/categories${query({ limit: COLLECTION_PAGE_LIMIT, cursor })}`
        );
      return (await collectAllPages(page)).items;
    },
    create: (req: CreateCategoryRequest) =>
      request<SuccessEnvelope<Category>>('/categories', {
        method: 'POST',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    update: (id: string, req: UpdateCategoryRequest) =>
      request<SuccessEnvelope<Category>>(`/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    archive: (id: string) =>
      request<SuccessEnvelope<Category>>(`/categories/${id}/archive`, {
        method: 'POST',
      }).then((env) => env.data),
  },

  budgets: {
    list: async () => {
      const page = (cursor: string | undefined) =>
        request<CollectionEnvelope<Budget>>(
          `/budgets${query({ limit: COLLECTION_PAGE_LIMIT, cursor })}`
        );
      return (await collectAllPages(page)).items;
    },
    create: (req: CreateBudgetRequest) =>
      request<SuccessEnvelope<Budget>>('/budgets', {
        method: 'POST',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    update: (id: string, req: UpdateBudgetRequest) =>
      request<SuccessEnvelope<Budget>>(`/budgets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    delete: (id: string) =>
      request<void>(`/budgets/${id}`, { method: 'DELETE' }),
  },

  savingsGoals: {
    list: async () => {
      const page = (cursor: string | undefined) =>
        request<CollectionEnvelope<SavingsGoal>>(
          `/savings-goals${query({ limit: COLLECTION_PAGE_LIMIT, cursor })}`
        );
      return (await collectAllPages(page)).items;
    },
    create: (req: CreateSavingsGoalRequest) =>
      request<SuccessEnvelope<SavingsGoal>>('/savings-goals', {
        method: 'POST',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    get: (id: string) =>
      request<SuccessEnvelope<SavingsGoal>>(`/savings-goals/${id}`).then(
        (env) => env.data
      ),
    update: (id: string, req: UpdateSavingsGoalRequest) =>
      request<SuccessEnvelope<SavingsGoal>>(`/savings-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      }).then((env) => env.data),
    archive: (id: string) =>
      request<SuccessEnvelope<SavingsGoal>>(`/savings-goals/${id}/archive`, {
        method: 'POST',
      }).then((env) => env.data),
  },

  dashboard: {
    getSummary: () =>
      request<SuccessEnvelope<DashboardSummary>>('/dashboard/summary').then(
        (env) => env.data
      ),
  },
};
