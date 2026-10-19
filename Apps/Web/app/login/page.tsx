'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/shared/auth-layout';
import { getAuthFailureMessage } from '@/lib/auth-feedback';
import { toast } from 'sonner';
import { ArrowRight, Loader2, LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (error: unknown) {
      toast.error(getAuthFailureMessage(error, 'sign in'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <section className="rounded-3xl border border-border/80 bg-card/90 p-6 shadow-[var(--shadow-card)] backdrop-blur sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Your Finora workspace
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Private. Personal. Ready when you are.
            </p>
          </div>
        </div>

        <header className="mb-7 space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[2.1rem]">
            Welcome back
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Sign in to pick up where you left off.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
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
              className="h-12 rounded-xl bg-background/80"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-12 rounded-xl bg-background/80"
              required
            />
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
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-7 text-center text-sm text-muted-foreground">
          New to Finora?{' '}
          <Link
            href="/register"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Create your account
          </Link>
        </p>
      </section>
    </AuthLayout>
  );
}
