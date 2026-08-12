'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Activity, LogOut, Menu, Settings, Users, Workflow, X } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useOrg } from '@/components/providers/org-provider';
import { OrgSwitcher } from '@/components/org-switcher';
import { QuotaMeter } from '@/components/quota-meter';
import { Button } from '@/components/ui/button';
import { useQuery } from '@/hooks/use-query';
import { ORG_USAGE } from '@/lib/gql';
import { resetSubscriptionClient } from '@/hooks/use-subscription';
import { canManageMembers } from '@/lib/step-catalog';
import { actionTransport } from '@/lib/actions';
import type { UsageSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Workflows', icon: Workflow },
  { href: '/runs', label: 'Runs', icon: Activity },
  { href: '/members', label: 'Members', icon: Users, ownerOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { activeOrgId, role } = useOrg();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: usageData } = useQuery<{ org_usage_summary: UsageSummary[] }>(
    ORG_USAGE,
    { orgId: activeOrgId },
    { skip: !activeOrgId },
  );
  const usage = usageData?.org_usage_summary?.[0] ?? null;

  async function onSignOut() {
    resetSubscriptionClient();
    await signOut();
    router.replace('/login');
  }

  const nav = NAV.filter((item) => !item.ownerOnly || canManageMembers(role));

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link href="/dashboard" className="flex items-center gap-2 px-1 py-1">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
          <Workflow className="size-4" />
        </span>
        <span className="text-sm font-semibold text-ink">Agent Flow</span>
      </Link>

      <OrgSwitcher />

      <nav className="flex flex-col gap-0.5">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent-soft font-medium text-accent-ink'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <QuotaMeter usage={usage} compact />

        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
          <p className="truncate text-xs font-medium text-ink">{user?.displayName}</p>
          <p className="truncate text-[11px] text-ink-3">{user?.email}</p>
          <Button variant="ghost" size="sm" onClick={onSignOut} className="mt-1.5 -ml-1.5">
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>

        {actionTransport === 'direct' ? (
          <p className="px-1 text-[11px] leading-snug text-ink-3">
            Actions are using the <span className="font-medium">direct</span> transport (local
            development). Deployed builds call the Hasura Action.
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="animate-fade-rise relative z-10 h-full w-64 border-r border-line bg-surface">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2 md:hidden">
          <Button variant="ghost" size="sm" onClick={() => setMobileOpen((value) => !value)}>
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
          <span className="text-sm font-semibold text-ink">Agent Flow</span>
        </div>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
