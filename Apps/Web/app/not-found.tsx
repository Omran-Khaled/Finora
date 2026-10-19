import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="surface-card w-full max-w-md rounded-2xl p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Compass className="h-7 w-7" /></div>
        <div className="mt-5 font-display text-3xl font-semibold">Page not found</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">The page you requested doesn&apos;t exist or may have moved.</p>
        <Button asChild className="mt-6"><Link href="/dashboard"><ArrowLeft className="me-2 h-4 w-4" />Back to dashboard</Link></Button>
      </Card>
    </div>
  );
}
