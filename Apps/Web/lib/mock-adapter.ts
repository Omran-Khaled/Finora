// Mock adapter — the development implementation of the ApiClient contract.
// Wraps the in-memory fixture server; nothing outside this file may import
// mock-server internals directly.
import {
  mockAuth,
  mockAccountsApi,
  mockCategoriesApi,
  mockTransactionsApi,
  mockTransfersApi,
  mockBudgetsApi,
  mockSavingsGoalsApi,
  mockDashboardApi,
} from './mock-server';
import { collectAllPages, COLLECTION_PAGE_LIMIT } from './pagination';

export const mockApi = {
  auth: {
    register: (req: Parameters<typeof mockAuth.register>[0]) => mockAuth.register(req),
    login: (req: Parameters<typeof mockAuth.login>[0]) => mockAuth.login(req),
    logout: () => mockAuth.logout(),
    refresh: () => mockAuth.refresh(),
    me: () => mockAuth.me(),
    updateProfile: (req: Parameters<typeof mockAuth.updateProfile>[0]) =>
      mockAuth.updateProfile(req),
  },

  accounts: {
    // Bounded full-collection read: reference lists render in full, so the
    // adapter walks every page (at most COLLECTION_MAX_PAGES) instead of
    // returning only the first server page. Transactions keep explicit paging.
    list: async () => (await collectAllPages((cursor) => mockAccountsApi.listPage(cursor, COLLECTION_PAGE_LIMIT))).items,
    create: (req: Parameters<typeof mockAccountsApi.create>[0]) => mockAccountsApi.create(req),
    get: (id: string) => mockAccountsApi.get(id),
    update: (id: string, req: Parameters<typeof mockAccountsApi.update>[1]) =>
      mockAccountsApi.update(id, req),
    archive: (id: string) => mockAccountsApi.archive(id),
  },

  transactions: {
    list: (filters?: Parameters<typeof mockTransactionsApi.list>[0]) =>
      mockTransactionsApi.list(filters),
    create: (
      req: Parameters<typeof mockTransactionsApi.create>[0],
      idempotencyKey: string
    ) => mockTransactionsApi.create(req, idempotencyKey),
    get: (id: string) => mockTransactionsApi.get(id),
    update: (id: string, req: Parameters<typeof mockTransactionsApi.update>[1]) =>
      mockTransactionsApi.update(id, req),
    void: (id: string) => mockTransactionsApi.void(id),
  },

  transfers: {
    create: (
      req: Parameters<typeof mockTransfersApi.create>[0],
      idempotencyKey: string
    ) => mockTransfersApi.create(req, idempotencyKey),
    get: (id: string) => mockTransfersApi.get(id),
  },

  categories: {
    list: async () => (await collectAllPages((cursor) => mockCategoriesApi.listPage(cursor, COLLECTION_PAGE_LIMIT))).items,
    create: (req: Parameters<typeof mockCategoriesApi.create>[0]) => mockCategoriesApi.create(req),
    update: (id: string, req: Parameters<typeof mockCategoriesApi.update>[1]) =>
      mockCategoriesApi.update(id, req),
    archive: (id: string) => mockCategoriesApi.archive(id),
  },

  budgets: {
    list: async () => (await collectAllPages((cursor) => mockBudgetsApi.listPage(cursor, COLLECTION_PAGE_LIMIT))).items,
    create: (req: Parameters<typeof mockBudgetsApi.create>[0]) => mockBudgetsApi.create(req),
    update: (id: string, req: Parameters<typeof mockBudgetsApi.update>[1]) =>
      mockBudgetsApi.update(id, req),
    delete: (id: string) => mockBudgetsApi.delete(id),
  },

  savingsGoals: {
    list: async () => (await collectAllPages((cursor) => mockSavingsGoalsApi.listPage(cursor, COLLECTION_PAGE_LIMIT))).items,
    create: (req: Parameters<typeof mockSavingsGoalsApi.create>[0]) =>
      mockSavingsGoalsApi.create(req),
    get: (id: string) => mockSavingsGoalsApi.get(id),
    update: (id: string, req: Parameters<typeof mockSavingsGoalsApi.update>[1]) =>
      mockSavingsGoalsApi.update(id, req),
    archive: (id: string) => mockSavingsGoalsApi.archive(id),
  },

  dashboard: {
    getSummary: () => mockDashboardApi.getSummary(),
  },
};
