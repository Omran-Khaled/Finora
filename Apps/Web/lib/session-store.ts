// Auth session persistence boundary (U-001).
// This is the ONLY module that knows how auth state is stored. Today it is
// sessionStorage/localStorage (prototype); moving to a backend session/cookie
// later means changing this file only — no screens or providers change.
//
// U-001: the token, the cached user and the mock demo fixture used to live in
// three independent keys, so logging out could leave a "logged-out user with a
// session" (ghost session) or a stale financial demo. All three are now written
// and cleared together. No passwords are ever stored here.
import type { User } from './types';

/** Bearer token key — read by `http-adapter` for every real request. */
export const TOKEN_KEY = 'finora-auth-token';
/** Cached profile so the shell can render before `/auth/me` answers. */
export const SESSION_KEY = 'finora-session';
/** Mock-mode demo fixture (only written when the mock adapter is active). */
export const MOCK_STATE_KEY = 'finora-mock-state-v1';
const ONBOARDING_KEY = 'finora-onboarding-complete';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readToken(): string | null {
  try {
    return storage()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (token) store.setItem(TOKEN_KEY, token);
    else store.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable; request remains memory-only until the next page load.
  }
}

/** A session is only valid when BOTH the token and the cached user are present. */
export function loadSessionUser(): User | null {
  if (!readToken()) return null;
  try {
    const raw = storage()?.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    // Corrupted session — treat as signed out.
    clearSession();
    return null;
  }
}

/** Persists the whole session in one call so the three keys cannot drift apart. */
export function saveSession(token: string, user: User): void {
  writeToken(token);
  try {
    storage()?.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable — session stays in memory only.
  }
}

export function loadOnboardingComplete(): boolean {
  try {
    return storage()?.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveOnboardingComplete(): void {
  try {
    storage()?.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // Storage unavailable — onboarding flag stays in memory only.
  }
}

/**
 * Clears every key owned by the session, including the mock demo fixture, so a
 * reload after logout can never restore a ghost session (U-001).
 */
export function clearSession(): void {
  try {
    const store = storage();
    store?.removeItem(SESSION_KEY);
    store?.removeItem(TOKEN_KEY);
    store?.removeItem(ONBOARDING_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
  if (typeof window === 'undefined') return;
  try {
    // The mock fixture lives in localStorage (see mock-server.ts).
    window.localStorage.removeItem(MOCK_STATE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
