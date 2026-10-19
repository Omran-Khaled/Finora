/**
 * AUTH SERVICE (Section 30).
 * Auth Provider → Auth Service → Storage Abstraction.
 * UI never touches SecureStorage / session internals directly.
 */

import type { LoginRequest, RegisterRequest, User } from '../../types/contract';
import { api } from '../api/apiClient';

export interface AuthSessionResult {
  user: User;
  token: string;
}

export const AuthService = {
  async register(req: RegisterRequest): Promise<AuthSessionResult> {
    return api.register(req);
  },

  async login(req: LoginRequest): Promise<AuthSessionResult> {
    return api.login(req);
  },

  async logout(): Promise<void> {
    await api.logout();
  },

  async getCurrentUser(): Promise<User | null> {
    return api.getCurrentUser();
  },
};