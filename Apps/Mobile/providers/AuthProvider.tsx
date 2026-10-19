/**
 * AUTH PROVIDER (Section 30).
 * Bootstraps the session (Secure Storage → Auth Service → API accounts check)
 * and exposes signIn / signUp / completeOnboarding / signOut.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types/contract';
import { AuthService } from '../lib/auth/authService';
import { api } from '../lib/api/apiClient';
import { isApiError } from '../lib/api/errors';
import { Telemetry } from '../lib/telemetry';

interface AuthContextValue {
  user: User | null;
  needsOnboarding: boolean;
  isInitializing: boolean;
  signIn: (user: User) => Promise<void>;
  signUp: (user: User) => void;
  completeOnboarding: () => void;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const refreshOnboardingFlag = useCallback(async () => {
    try {
      const accounts = await api.getAccounts();
      setNeedsOnboarding(accounts.length === 0);
    } catch (error) {
      if (isApiError(error) && error.error.code === 'UNAUTHORIZED') {
        await AuthService.logout();
        setUser(null);
        setNeedsOnboarding(false);
        return;
      }
      // An unavailable account list is not evidence that this returning user
      // has never completed onboarding. Preserve the last known state.
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const currentUser = await AuthService.getCurrentUser();
        if (!mounted) return;
        if (currentUser) {
          setUser(currentUser);
          await refreshOnboardingFlag();
        }
      } catch {
        // Unauthenticated — stay on auth screens
      } finally {
        if (mounted) setIsInitializing(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshOnboardingFlag]);

  const signIn = useCallback(
    async (signedInUser: User) => {
      setUser(signedInUser);
      setNeedsOnboarding(false);
      await refreshOnboardingFlag();
    },
    [refreshOnboardingFlag],
  );

  const signUp = useCallback((signedUpUser: User) => {
    setUser(signedUpUser);
    setNeedsOnboarding(true);
  }, []);

  const completeOnboarding = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  const signOut = useCallback(async () => {
    await AuthService.logout();
    Telemetry.track('screen_opened', { screenName: 'Login' });
    setUser(null);
    setNeedsOnboarding(false);
  }, []);

  const clearError = useCallback(() => {
    // Reserved for future error-boundary reset flows.
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      needsOnboarding,
      isInitializing,
      signIn,
      signUp,
      completeOnboarding,
      signOut,
      clearError,
    }),
    [user, needsOnboarding, isInitializing, signIn, signUp, completeOnboarding, signOut, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}