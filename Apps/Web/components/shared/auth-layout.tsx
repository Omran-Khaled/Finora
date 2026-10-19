import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="auth-brand-panel relative hidden min-h-screen flex-col justify-between overflow-hidden px-10 py-9 text-white lg:flex xl:px-14">
        <div className="auth-orb auth-orb-one" aria-hidden="true" />
        <div className="auth-orb auth-orb-two" aria-hidden="true" />
        <div className="relative z-10">
          <Link
            href="/login"
            aria-label="Finora home"
            className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-primary"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-inner">
              <span className="font-display text-xl font-bold" aria-hidden="true">
                F
              </span>
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">
              Finora
            </span>
          </Link>

          <div className="mt-[clamp(4rem,14vh,9rem)] max-w-lg">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              A clearer view of your money
            </p>
            <h2 className="mt-6 font-display text-balance text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
              Make space for better money decisions.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/70">
              Bring accounts, everyday spending and future plans into one calm,
              considered financial workspace.
            </p>

            <div className="mt-10 max-w-md rounded-2xl border border-white/15 bg-white/[0.08] p-5 shadow-2xl shadow-black/10 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
                    <Wallet className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      Your financial overview
                    </p>
                    <p className="mt-0.5 text-xs text-white/55">
                      A little more clarity, every day
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-white/60" aria-hidden="true" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-white/70" />
                <div className="h-1.5 rounded-full bg-white/35" />
                <div className="h-1.5 rounded-full bg-white/20" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-white/65">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Your accounts stay yours
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/65">
          <span className="inline-flex items-center gap-2">
            <Check
              className="h-3.5 w-3.5 text-emerald-200"
              aria-hidden="true"
            />
            Clear by design
          </span>
          <span className="inline-flex items-center gap-2">
            <Check
              className="h-3.5 w-3.5 text-emerald-200"
              aria-hidden="true"
            />
            Built around your currency
          </span>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
        <div className="mb-7 flex w-full max-w-[30rem] items-center justify-between lg:hidden">
          <Link
            href="/login"
            aria-label="Finora home"
            className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span className="font-display text-lg font-bold" aria-hidden="true">
                F
              </span>
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">
              Finora
            </span>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Your money, your view
          </span>
        </div>
        <div className="auth-enter w-full max-w-[30rem]">{children}</div>
        <p className="mt-7 max-w-[30rem] text-center text-xs leading-5 text-muted-foreground">
          Finora helps you organize your finances. You stay in control of the
          accounts and information you choose to add.
        </p>
      </main>
    </div>
  );
}
