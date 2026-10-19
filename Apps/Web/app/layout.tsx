import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AppProviders } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Finora — Understand your money',
  description:
    'Finora helps you understand your financial position, track income and expenses, manage budgets, and reach savings goals.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ),
  openGraph: {
    title: 'Finora — Understand your money',
    description:
      'Understand your financial position, track income and expenses, manage budgets, and reach savings goals.',
  },
  icons: {
    icon: '/icon.svg',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0f6b63',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
