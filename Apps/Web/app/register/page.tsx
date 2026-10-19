'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/shared/auth-layout';
import { CURRENCIES } from '@/lib/constants';
import { getAuthFailureMessage } from '@/lib/auth-feedback';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, baseCurrency);
      toast.success("Account created! Let's set up your finances.");
      router.push('/onboarding');
    } catch (error: unknown) {
      toast.error(getAuthFailureMessage(error, 'create account'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <section className="rounded-3xl border border-border/80 bg-card/90 p-6 shadow-[var(--shadow-card)] backdrop-blur sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              A fresh perspective
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start with the view that works for you.
            </p>
          </div>
        </div>

        <header className="mb-6 space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[2.1rem]">
            Build your financial home
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Create your space to understand balances, spending and goals.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              className="h-11 rounded-xl bg-background/80"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-describedby="password-hint"
              className="h-11 rounded-xl bg-background/80"
              required
            />
            <p id="password-hint" className="text-xs text-muted-foreground">Use at least 8 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="h-11 rounded-xl bg-background/80"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseCurrency">Base currency</Label>
            <select
              id="baseCurrency"
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.label}
                </option>
              ))}
            </select>
            <p className="text-xs leading-5 text-muted-foreground">
              Your base currency keeps account balances consistent. You can
              choose it before adding your first account.
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-xl shadow-sm shadow-primary/15"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="me-2 h-4 w-4" aria-hidden="true" />
            )}
            {loading ? 'Creating your account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </section>
    </AuthLayout>
  );
}
