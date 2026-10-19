'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';

export default function Home() {
  const { user, loading, hasCompletedOnboarding } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (!hasCompletedOnboarding) {
      router.replace('/onboarding');
    } else {
      router.replace('/dashboard');
    }
  }, [user, loading, hasCompletedOnboarding, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
