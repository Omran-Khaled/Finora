/**
 * REAL HTTP ADAPTER (Section 28) — `/api/v1` (swap-in replacement for the Mock).
 * - Bearer token from the client session (never persisted in code).
 * - GET/HEAD requests retry once on transient network failure; retry is NEVER applied
 *   to financial POSTs (idempotency-Key is the only dedup path).
 * - Bounded 15s timeout via AbortController.
 *
 * Requires `EXPO_PUBLIC_API_URL` + `EXPO_PUBLIC_USE_REAL_API=1`.
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
  UpdateAccountRequest
} from "../../types/contract";
import type { ApiAdapter, AuthResult, TransferCreationResult } from "./adapter";
import { createApiError, mapHttpError, isApiError } from "./errors";
import { collectAllPages, COLLECTION_PAGE_LIMIT, type PagedEnvelope } from "./pagination";
import { SecureStorage } from "../storage/secureStorage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const API_BASE_PATH = `/${(process.env.EXPO_PUBLIC_API_BASE_PATH || "api/v1").replace(/^\/+|\/+$/g, "")}`;

function resolveBaseUrl(): string {
  const configuredUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
  if (!configuredUrl || Platform.OS === "web") return configuredUrl;

  try {
    const url = new URL(configuredUrl);
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return configuredUrl;

    const hostUri = Constants.expoConfig?.hostUri;
    const host = hostUri?.split(":")[0];
    if (host) {
      url.hostname = host;
      return url.toString().replace(/\/+$/, "");
    }

    if (Platform.OS === "android") url.hostname = "10.0.2.2";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return configuredUrl;
  }
}

const BASE_URL = resolveBaseUrl();
const REQUEST_TIMEOUT_MS = 15000;

type JsonBody = Record<string, unknown> | null;

interface RequestOptions {
  method?: "GET" | "HEAD" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: JsonBody;
  idempotencyKey?: string;
  retryOnNetworkError?: boolean;
}

function randomRequestId(): string {
  return "req_" + Math.random().toString(36).substring(2, 9);
}

function responseRequestId(response: Response): string {
  return response.headers?.get("x-request-id") || response.headers?.get("x-requestid") || randomRequestId();
}

function logRequestFailure(url: string, error: unknown): void {
  if (process.env.EXPO_PUBLIC_ENABLE_DEBUG_LOGS !== "true") return;
  const message = error instanceof Error
    ? error.message
    : isApiError(error)
      ? JSON.stringify(error.error)
      : String(error);
  console.warn(`[Finora API] ${url} failed: ${message}`);
}

function isTransportFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export class HttpAdapter implements ApiAdapter {
  private token: string | null = null;
  private refreshInFlight: Promise<ApiResponse<AuthResult>> | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!BASE_URL) {
      throw createApiError("NETWORK_ERROR", "API base URL is not configured (EXPO_PUBLIC_API_URL).");
    }

    const run = async (): Promise<T> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const url = BASE_URL + API_BASE_PATH + path;
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (this.token) headers.Authorization = "Bearer " + this.token;
      if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

      try {
        const response = await fetch(url, {
          method: options.method || "GET",
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        const rawText = await response.text();
        let body: unknown = null;
        if (rawText) {
          try {
            body = JSON.parse(rawText) as unknown;
          } catch (error) {
            const requestId = responseRequestId(response);
            logRequestFailure(url, error);
            if (!response.ok) throw mapHttpError(response.status, null, requestId);
            throw createApiError("NETWORK_ERROR", "The service returned an invalid response.", requestId);
          }
        }

        if (!response.ok) {
          throw mapHttpError(response.status, body, responseRequestId(response));
        }

        return body as T;
      } catch (error) {
        logRequestFailure(url, error);
        const method = options.method ?? "GET";
        const isSafeMethod = method === "GET" || method === "HEAD";
        if (
          isSafeMethod &&
          options.retryOnNetworkError &&
          !isApiError(error) &&
          isTransportFailure(error)
        ) {
          throw createApiError(
            "NETWORK_ERROR",
            controller.signal.aborted
              ? "The request timed out. Please try again."
              : "We couldn't connect to the service. Please try again.",
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      return await run();
    } catch (err) {
      // GET-only: when the session expired mid-flight, exchange the token once and
      // replay the request exactly once. Never applied to the refresh call itself.
      const isGet = (options.method ?? "GET") === "GET";
      const canRefresh =
        isGet && path !== "/auth/refresh" && Boolean(this.token) && isApiError(err) && err.error.code === "UNAUTHORIZED";
      if (canRefresh) {
        await this.refresh();
        return await run();
      }
      // GET/HEAD-only: one safe retry on transient failure.
      const method = options.method ?? "GET";
      const isSafeMethod = method === "GET" || method === "HEAD";
      const retryable =
        isSafeMethod &&
        options.retryOnNetworkError &&
        isApiError(err) &&
        err.error.code === "NETWORK_ERROR";
      if (retryable) {
        return await run();
      }
      throw err;
    }
  }

  // ---------- Auth ----------
  register(req: RegisterRequest): Promise<ApiResponse<AuthResult>> {
    return this.request<ApiResponse<AuthResult>>("/auth/register", {
      method: "POST",
      body: req as unknown as JsonBody,
    });
  }

  login(req: LoginRequest): Promise<ApiResponse<AuthResult>> {
    return this.request<ApiResponse<AuthResult>>("/auth/login", {
      method: "POST",
      body: req as unknown as JsonBody,
    });
  }

  async refresh(): Promise<ApiResponse<AuthResult>> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const res = await this.request<ApiResponse<AuthResult>>("/auth/refresh", { method: "POST" });
        this.setToken(res.data.token);
        await SecureStorage.setItem("auth_token", res.data.token);
        await SecureStorage.setItem("session_user", JSON.stringify(res.data.user));
        return res;
      } catch (error) {
        if (isApiError(error) && error.error.code === "UNAUTHORIZED") {
          this.setToken(null);
          await SecureStorage.clearSession();
          throw error;
        }

        // Refresh rotates the old token on the server. If its response is lost,
        // the client cannot know whether rotation committed, so retain the
        // credential and let a later definitive UNAUTHORIZED response invalidate
        // it. Do not retry refresh: replaying an ambiguously completed rotation
        // could invalidate the replacement token.
        if (isApiError(error)) throw error;
        throw createApiError("NETWORK_ERROR", "We couldn't connect to the service. Please try again.");
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  logout(): Promise<void> {
    return this.request<void>("/auth/logout", { method: "POST" }).finally(() => {
      this.setToken(null);
    });
  }

  // ---------- Dashboard ----------
  getDashboardSummary(userId: string): Promise<ApiResponse<DashboardSummaryResponse>> {
    return this.request<ApiResponse<DashboardSummaryResponse>>("/dashboard/summary", {
      retryOnNetworkError: true,
    });
  }

  // ---------- Accounts ----------
  // Bounded full-collection read matching the mock adapter: walk every page
  // (at most COLLECTION_MAX_PAGES) instead of returning only page 1.
  // Transactions keep explicit cursor paging in the screen.
  async getAccounts(userId: string): Promise<ApiCollectionResponse<Account>> {
    void userId;
    const page = async (cursor: string | undefined): Promise<PagedEnvelope<Account>> => {
      const params = new URLSearchParams();
      params.set("limit", String(COLLECTION_PAGE_LIMIT));
      if (cursor) params.set("cursor", cursor);
      return this.request<ApiCollectionResponse<Account>>("/accounts?" + params.toString(), {
        retryOnNetworkError: true,
      });
    };
    const { items } = await collectAllPages(page);
    return { data: items, meta: { nextCursor: null } };
  }

  createAccount(userId: string, req: CreateAccountRequest): Promise<ApiResponse<Account>> {
    return this.request<ApiResponse<Account>>("/accounts", {
      method: "POST",
      body: req as unknown as JsonBody,
    });
  }

  updateAccount(userId: string, accountId: string, req: UpdateAccountRequest): Promise<ApiResponse<Account>> {
    void userId;
    return this.request<ApiResponse<Account>>("/accounts/" + encodeURIComponent(accountId), {
      method: "PATCH",
      body: req as unknown as JsonBody,
    });
  }

  archiveAccount(userId: string, accountId: string): Promise<ApiResponse<Account>> {
    return this.request<ApiResponse<Account>>("/accounts/" + encodeURIComponent(accountId) + "/archive", {
      method: "POST",
    });
  }

  // ---------- Categories ----------
  async getCategories(userId: string): Promise<ApiCollectionResponse<Category>> {
    void userId;
    const page = async (cursor: string | undefined): Promise<PagedEnvelope<Category>> => {
      const params = new URLSearchParams();
      params.set("limit", String(COLLECTION_PAGE_LIMIT));
      if (cursor) params.set("cursor", cursor);
      return this.request<ApiCollectionResponse<Category>>("/categories?" + params.toString(), {
        retryOnNetworkError: true,
      });
    };
    const { items } = await collectAllPages(page);
    return { data: items, meta: { nextCursor: null } };
  }

  createCategory(userId: string, req: CreateCategoryRequest): Promise<ApiResponse<Category>> {
    return this.request<ApiResponse<Category>>("/categories", {
      method: "POST",
      body: req as unknown as JsonBody,
    });
  }

  // X-001(a): the server has no `DELETE /categories/:id`; archiving is the only
  // supported removal and mirrors `POST /categories/:id/archive` on Web.
  deleteCategory(userId: string, categoryId: string): Promise<ApiResponse<Category>> {
    return this.request<ApiResponse<Category>>(
      "/categories/" + encodeURIComponent(categoryId) + "/archive",
      { method: "POST" },
    );
  }

  // ---------- Transactions ----------
  getTransactions(userId: string, filters?: TransactionFilterParams): Promise<ApiCollectionResponse<Transaction>> {
    const params = new URLSearchParams();
    if (filters?.accountId) params.set("accountId", filters.accountId);
    if (filters?.categoryId) params.set("categoryId", filters.categoryId);
    if (filters?.type) params.set("type", filters.type);
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    if (filters?.cursor) params.set("cursor", filters.cursor);
    if (filters?.limit != null) params.set("limit", String(filters.limit));
    const qs = params.toString();
    return this.request<ApiCollectionResponse<Transaction>>(
      "/transactions" + (qs ? "?" + qs : ""),
      { retryOnNetworkError: true },
    );
  }

  createTransaction(userId: string, req: CreateTransactionRequest, idempotencyKey: string): Promise<ApiResponse<Transaction>> {
    return this.request<ApiResponse<Transaction>>("/transactions", {
      method: "POST",
      body: req as unknown as JsonBody,
      idempotencyKey,
      retryOnNetworkError: false,
    });
  }

  voidTransaction(userId: string, transactionId: string): Promise<ApiResponse<Transaction>> {
    return this.request<ApiResponse<Transaction>>(
      "/transactions/" + encodeURIComponent(transactionId) + "/void",
      { method: "POST" },
    );
  }

  // ---------- Transfers ----------
  createTransfer(userId: string, req: CreateTransferRequest, idempotencyKey: string): Promise<ApiResponse<TransferCreationResult>> {
    return this.request<ApiResponse<TransferCreationResult>>("/transfers", {
      method: "POST",
      body: req as unknown as JsonBody,
      idempotencyKey,
      retryOnNetworkError: false,
    });
  }

  // ---------- Budgets ----------
  async getBudgets(userId: string): Promise<ApiCollectionResponse<Budget>> {
    void userId;
    const page = async (cursor: string | undefined): Promise<PagedEnvelope<Budget>> => {
      const params = new URLSearchParams();
      params.set("limit", String(COLLECTION_PAGE_LIMIT));
      if (cursor) params.set("cursor", cursor);
      return this.request<ApiCollectionResponse<Budget>>("/budgets?" + params.toString(), {
        retryOnNetworkError: true,
      });
    };
    const { items } = await collectAllPages(page);
    return { data: items, meta: { nextCursor: null } };
  }

  createBudget(userId: string, req: CreateBudgetRequest): Promise<ApiResponse<Budget>> {
    return this.request<ApiResponse<Budget>>("/budgets", {
      method: "POST",
      body: req as unknown as JsonBody,
    });
  }

  deleteBudget(userId: string, budgetId: string): Promise<ApiResponse<Record<string, never>>> {
    return this.request<ApiResponse<Record<string, never>>>(
      "/budgets/" + encodeURIComponent(budgetId),
      { method: "DELETE" },
    );
  }

  // ---------- Savings Goals ----------
  async getSavingsGoals(userId: string): Promise<ApiCollectionResponse<SavingsGoal>> {
    void userId;
    const page = async (cursor: string | undefined): Promise<PagedEnvelope<SavingsGoal>> => {
      const params = new URLSearchParams();
      params.set("limit", String(COLLECTION_PAGE_LIMIT));
      if (cursor) params.set("cursor", cursor);
      return this.request<ApiCollectionResponse<SavingsGoal>>("/savings-goals?" + params.toString(), {
        retryOnNetworkError: true,
      });
    };
    const { items } = await collectAllPages(page);
    return { data: items, meta: { nextCursor: null } };
  }

  createSavingsGoal(userId: string, req: CreateGoalRequest): Promise<ApiResponse<SavingsGoal>> {
    return this.request<ApiResponse<SavingsGoal>>("/savings-goals", {
      method: "POST",
      body: req as unknown as JsonBody,
    });
  }

  archiveSavingsGoal(userId: string, goalId: string): Promise<ApiResponse<SavingsGoal>> {
    return this.request<ApiResponse<SavingsGoal>>(
      "/savings-goals/" + encodeURIComponent(goalId) + "/archive",
      { method: "POST" },
    );
  }
}

export const httpAdapter = new HttpAdapter();