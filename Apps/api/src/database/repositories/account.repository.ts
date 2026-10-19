import { AccountRecord } from '../../core/store';
import { Page } from '../../core/pagination';

export interface AccountRepository {
  findByIdForUser(userId: string, accountId: string): Promise<AccountRecord | null>;
  listForUser(userId: string, page?: { cursor?: string; limit?: number }): Promise<Page<AccountRecord>>;
  create(account: AccountRecord): Promise<AccountRecord>;
  updateName(userId: string, accountId: string, name: string): Promise<AccountRecord | null>;
  balance(accountId: string): Promise<bigint>;
  hasAccounts(userId: string): Promise<boolean>;
  findUserBaseCurrency(userId: string): Promise<string | null>;
}
