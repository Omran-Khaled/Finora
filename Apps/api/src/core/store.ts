import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type AccountType = 'CASH' | 'BANK' | 'SAVINGS';
export type AccountStatus = 'ACTIVE' | 'ARCHIVED';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TransactionStatus = 'ACTIVE' | 'VOIDED';
export type CategoryType = 'INCOME' | 'EXPENSE';
export type CategoryStatus = 'ACTIVE' | 'ARCHIVED';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  baseCurrency: string;
}

export interface SessionRecord {
  userId: string;
  expiresAt: number;
}

export interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currencyCode: string;
  openingBalanceMinor: bigint;
  status: AccountStatus;
}

export interface CategoryRecord {
  id: string;
  userId: string | null;
  name: string;
  type: CategoryType;
  isSystem: boolean;
  status: CategoryStatus;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amountMinor: bigint;
  currencyCode: string;
  description: string | null;
  transactionDate: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  transferDirection?: 'SOURCE' | 'DESTINATION';
  idempotencyKey?: string;
  payloadFingerprint?: string;
}

export interface TransferRecord {
  id: string;
  userId: string;
  sourceTransactionId: string;
  destinationTransactionId: string;
  idempotencyKey?: string;
  payloadFingerprint?: string;
  createdAt: string;
}

export interface BudgetRecord {
  id: string;
  userId: string;
  categoryId: string;
  year: number;
  month: number;
  limitMinor: bigint;
}

export interface GoalRecord {
  id: string;
  userId: string;
  accountId: string;
  name: string;
  targetAmountMinor: bigint;
  targetDate: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
}

@Injectable()
export class InMemoryStore {
  readonly users = new Map<string, UserRecord>();
  readonly usersByEmail = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly accounts = new Map<string, AccountRecord>();
  readonly categories = new Map<string, CategoryRecord>();
  readonly transactions = new Map<string, TransactionRecord>();
  readonly transactionsByIdempotency = new Map<string, string>();
  readonly transactionIdempotencyFingerprints = new Map<string, string>();
  readonly transfers = new Map<string, TransferRecord>();
  readonly transfersByIdempotency = new Map<string, string>();
  readonly transferIdempotencyFingerprints = new Map<string, string>();
  readonly budgets = new Map<string, BudgetRecord>();
  readonly goals = new Map<string, GoalRecord>();

  constructor() {
    for (const name of ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Education', 'Other']) {
      const category = { id: randomUUID(), userId: null, name, type: 'EXPENSE' as const, isSystem: true, status: 'ACTIVE' as const };
      this.categories.set(category.id, category);
    }
  }

  id(): string {
    return randomUUID();
  }

  accountBalance(accountId: string): bigint {
    const account = this.accounts.get(accountId);
    if (!account) return 0n;
    let balance = account.openingBalanceMinor;
    for (const transaction of this.transactions.values()) {
      if (transaction.accountId !== accountId || transaction.status === 'VOIDED') continue;
      if (transaction.type === 'INCOME' || transaction.transferDirection === 'DESTINATION') balance += transaction.amountMinor;
      else balance -= transaction.amountMinor;
    }
    return balance;
  }

  rebuildAccountBalance(accountId: string): bigint {
    return this.accountBalance(accountId);
  }
}
