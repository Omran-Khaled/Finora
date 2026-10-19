'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api-client';
import {
  loadSessionUser,
  saveSession,
  readToken,
  loadOnboardingComplete,
  saveOnboardingComplete,
  clearSession,
} from '@/lib/session-store';
import type { User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, baseCurrency?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateBaseCurrency: (currency: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  hasCompletedOnboarding: boolean;
  setOnboardingComplete: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  const persistUser = useCallback((u: User | null, token?: string) => {
    if (!u) {
      clearSession();
      return;
    }
    // U-001: a profile is only persisted alongside a token, so a reload can never
    // restore a "user without a session" (ghost session).
    const activeToken = token ?? readToken();
    if (activeToken) saveSession(activeToken, u);
  }, []);

  // Restore cached state immediately, then revalidate it against the active
  // API session. This prevents a revoked/expired server session from leaving a
  // stale authenticated shell visible after a full page reload.
  useEffect(() => {
    let cancelled = false;
    const stored = loadSessionUser();
    setHasCompletedOnboarding(loadOnboardingComplete());

    if (!stored) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    setUser(stored);
    void api.auth.me()
      .then((activeUser) => {
        if (cancelled) return;
        if (activeUser) {
          setUser(activeUser);
          persistUser(activeUser);
        } else {
          clearSession();
          setUser(null);
          setHasCompletedOnboarding(false);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const code = (error as { error?: { code?: string } })?.error?.code;
        if (code === 'UNAUTHORIZED') {
          clearSession();
          setUser(null);
          setHasCompletedOnboarding(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [persistUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data, token } = await api.auth.login({ email, password });
      setUser(data);
      persistUser(data, token);
    },
    [persistUser]
  );

  const register = useCallback(
    async (email: string, password: string, baseCurrency = 'USD') => {
      const { data, token } = await api.auth.register({ email, password, baseCurrency });
      setUser(data);
      persistUser(data, token);
    },
    [persistUser]
  );

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
    setHasCompletedOnboarding(false);
    clearSession();
  }, []);

  const updateBaseCurrency = useCallback(
    async (currency: string) => {
      const updated = await api.auth.updateProfile({ baseCurrency: currency });
      setUser(updated);
      persistUser(updated);
    },
    [persistUser]
  );

  const refreshUser = useCallback(async () => {
    const u = await api.auth.me();
    if (u) {
      setUser(u);
      persistUser(u);
    }
  }, [persistUser]);

  const setOnboardingComplete = useCallback(() => {
    setHasCompletedOnboarding(true);
    saveOnboardingComplete();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateBaseCurrency,
        refreshUser,
        hasCompletedOnboarding,
        setOnboardingComplete,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
