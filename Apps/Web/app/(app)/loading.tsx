import { Skeleton } from '@/components/ui/skeleton';

export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" aria-busy="true" aria-label="Loading Finora">
      <div className="flex items-center justify-between">
        <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-40" /></div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <Skeleton className="h-44 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
    </div>
  );
}
