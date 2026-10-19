import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import { SecureStorage } from '../lib/storage/secureStorage';
import {
  getTokenColorRevision,
  setTokenColorScheme,
  subscribeToTokenColorScheme,
} from '../tokens/theme';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  isDark: boolean;
  revision: number;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const PREFERENCE_KEY = 'theme_preference';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function applyNativeColorScheme(preference: ThemePreference): void {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const revision = useSyncExternalStore(
    subscribeToTokenColorScheme,
    getTokenColorRevision,
    getTokenColorRevision,
  );
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
  const isDark = preference === 'dark' || (preference === 'system' && systemColorScheme === 'dark');

  useEffect(() => {
    let mounted = true;
    void SecureStorage.getItem(PREFERENCE_KEY).then((savedPreference) => {
      if (mounted && isThemePreference(savedPreference)) {
        setTokenColorScheme(
          savedPreference === 'dark' || (savedPreference === 'system' && systemColorScheme === 'dark')
            ? 'dark'
            : 'light',
        );
        setPreferenceState(savedPreference);
      }
      if (mounted) setIsPreferenceLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, [systemColorScheme]);

  useEffect(() => {
    if (!isPreferenceLoaded) return;
    setTokenColorScheme(isDark ? 'dark' : 'light');
    applyNativeColorScheme(preference);
  }, [isDark, isPreferenceLoaded, preference]);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    try {
      await SecureStorage.setItem(PREFERENCE_KEY, nextPreference);
    } catch {
      // Continue applying the in-memory preference if native persistence fails.
    }
    setTokenColorScheme(
      nextPreference === 'dark' || (nextPreference === 'system' && systemColorScheme === 'dark')
        ? 'dark'
        : 'light',
    );
    applyNativeColorScheme(nextPreference);
    setPreferenceState(nextPreference);
  }, [systemColorScheme]);

  const value = useMemo(
    () => ({ preference, isDark, revision, setPreference }),
    [preference, isDark, revision, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
