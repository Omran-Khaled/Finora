'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Wallet,
  Target,
  Settings,
  Tags,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';

const MENU_ITEMS = [
  {
    label: 'Accounts',
    href: '/accounts',
    icon: Wallet,
    description: 'Manage your cash, bank, and savings accounts.',
  },
  {
    label: 'Savings Goals',
    href: '/savings',
    icon: Target,
    description: 'Track progress toward your savings targets.',
  },
  {
    label: 'Categories',
    href: '/categories',
    icon: Tags,
    description: 'Organize your transactions with categories.',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'Manage your profile and preferences.',
  },
];

export default function MorePage() {
  const pathname = usePathname();

  return (
    <div>
      <PageHeader title="More" description="Access all features." />
      <div className="space-y-2">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <Card
                className={`flex items-center gap-4 p-4 transition-colors hover:bg-surface-muted/40 ${
                  active ? 'border-primary/30 bg-primary/5' : ''
                }`}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/8 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-foreground">
                    {item.label}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
