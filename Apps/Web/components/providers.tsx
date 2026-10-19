'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { AuthProvider } from '@/components/providers/auth-provider';
import { Toaster } from '@/components/ui/sonner';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <AuthProvider>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </AuthProvider>
    </NextThemesProvider>
  );
}
