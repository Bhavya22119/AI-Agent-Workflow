'use client';

/**
 * The application frame: a collapsible sidebar plus the page body.
 *
 * The rail sits at 68px and expands to 272px on hover, so the canvas-heavy pages
 * get their width back without the nav becoming a thing you have to go and find.
 * Everything that cannot survive a 68px column — the org switcher, the quota bar,
 * the signed-in identity — is wrapped in `SidebarSection`, which swaps in a single
 * icon while collapsed rather than letting wide content force the rail open.
 */
import { useSyncExternalStore, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Building2, Gauge, LogOut, Users, Workflow, Settings } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useOrg } from '@/components/providers/org-provider';
import { Logo, LogoMark } from '@/components/logo';
import { OrgSwitcher } from '@/components/org-switcher';
import { QuotaMeter } from '@/components/quota-meter';
import { Alert } from '@/components/ui/feedback';
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  SidebarSection,
  useSidebar,
  type SidebarLinkItem,
} from '@/components/ui/sidebar';
import { useQuery } from '@/hooks/use-query';
import { ORG_USAGE } from '@/lib/gql';
import { resetSubscriptionClient } from '@/hooks/use-subscription';
import { canManageMembers } from '@/lib/step-catalog';
import { onTransportChange, transportNotice } from '@/lib/actions';
import type { UsageSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Workflows', icon: Workflow },
  { href: '/runs', label: 'Runs', icon: Activity },
  { href: '/members', label: 'Members', icon: Users, ownerOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeOrgId, role } = useOrg();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const { data: usageData } = useQuery<{ org_usage_summary: UsageSummary[] }>(
    ORG_USAGE,
    { orgId: activeOrgId },
    { skip: !activeOrgId },
  );
  const usage = usageData?.org_usage_summary?.[0] ?? null;

  const links: SidebarLinkItem[] = NAV.filter(
    (item) => !item.ownerOnly || canManageMembers(role),
  ).map((item) => ({
    href: item.href,
    label: item.label,
    icon: <item.icon className="size-4.5" />,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
    onClick: () => setOpen(false),
  }));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody>
          <SidebarContents links={links} usage={usage} />
        </SidebarBody>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <TransportBanner />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContents({
  links,
  usage,
}: {
  links: SidebarLinkItem[];
  usage: UsageSummary | null;
}) {
  const { open, animate } = useSidebar();
  const collapsed = animate && !open;
  const { user, signOut } = useAuth();
  const { activeMembership } = useOrg();
  const router = useRouter();

  async function onSignOut() {
    resetSubscriptionClient();
    await signOut();
    router.replace('/login');
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Link
        href="/dashboard"
        className="flex h-11 shrink-0 items-center rounded-lg px-0.5"
        aria-label="Agent Flow — workflows"
      >
        {/* The rail is 68px wide with 24px of padding, so the collapsed mark can
            be 36px without the wordmark's width forcing the sidebar open. */}
        {collapsed ? <LogoMark className="size-9" /> : <Logo className="h-10" />}
      </Link>

      <SidebarSection
        collapsed={
          <span
            title={activeMembership?.organization.name}
            className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-ink"
          >
            <Building2 className="size-4" />
          </span>
        }
      >
        <OrgSwitcher />
      </SidebarSection>

      <nav className="flex flex-col gap-1">
        {links.map((link) => (
          <SidebarLink key={link.href} link={link} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <SidebarSection
          collapsed={
            usage ? (
              <span
                title={`Run quota ${usage.quota_used}/${usage.quota_limit}`}
                className={cn(
                  'grid size-9 place-items-center rounded-lg',
                  usage.quota_remaining <= 0
                    ? 'bg-danger-soft text-danger'
                    : 'bg-surface-2 text-ink-3',
                )}
              >
                <Gauge className="size-4" />
              </span>
            ) : null
          }
        >
          <QuotaMeter usage={usage} compact />
        </SidebarSection>

        <SidebarSection
          collapsed={
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <LogOut className="size-4" />
            </button>
          }
        >
          <div className="rounded-lg border border-line bg-surface-2/60 p-2.5">
            <p className="truncate text-xs font-medium text-ink">{user?.displayName}</p>
            <p className="truncate text-[11px] text-ink-3">{user?.email}</p>
            <button
              type="button"
              onClick={onSignOut}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-3 transition-colors hover:text-danger"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </SidebarSection>
      </div>
    </div>
  );
}

/**
 * Shown when Hasura could not reach the Action handler and the client fell back to
 * calling it directly. Without it, the app silently works while its metadata is
 * wrong — and the schedules and Event Triggers, which have no fallback, silently
 * do not fire.
 */
function TransportBanner() {
  const notice = useSyncExternalStore(onTransportChange, transportNotice, () => null);
  if (!notice) return null;
  return (
    <div className="px-4 pt-4 sm:px-8">
      <Alert tone="warning" title="Action handler unreachable from Hasura">
        {notice}
      </Alert>
    </div>
  );
}
