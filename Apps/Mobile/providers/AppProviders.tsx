/**
 * APPLICATION PROVIDERS (auth + network).
 */

import type { ReactNode } from 'react';
import { AuthProvider } from './AuthProvider';
import { NetworkProvider } from './NetworkProvider';
import { ThemeProvider } from './ThemeProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <AuthProvider>{children}</AuthProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}