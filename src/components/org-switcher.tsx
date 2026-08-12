'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOrg } from '@/components/providers/org-provider';
import { RoleBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Switches the active organization.
 *
 * Worth noting for the cross-tenant demo: this list contains only orgs the
 * signed-in user is a member of, because the query behind it returns only their
 * own org_members rows. An Org B user has no way to make Org A appear here, and
 * no way to reach Org A's data by pasting its id into a URL either — the pages
 * are driven by queries that Hasura filters the same way.
 */
export function OrgSwitcher() {
  const { memberships, activeOrgId, activeMembership, selectOrg } = useOrg();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!activeMembership) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-ink">
          <Building2 className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {activeMembership.organization.name}
          </span>
          <span className="block text-[11px] text-ink-3">{activeMembership.role}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" />
      </button>

      {open ? (
        <div
          role="listbox"
          className="animate-fade-rise absolute top-full left-0 z-30 mt-1 w-full min-w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-xl"
        >
          {memberships.map((membership) => (
            <button
              key={membership.id}
              type="button"
              role="option"
              aria-selected={membership.org_id === activeOrgId}
              onClick={() => {
                selectOrg(membership.org_id);
                setOpen(false);
                router.push('/dashboard');
              }}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <Check
                className={cn(
                  'size-4 shrink-0',
                  membership.org_id === activeOrgId ? 'text-accent' : 'text-transparent',
                )}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {membership.organization.name}
              </span>
              <RoleBadge role={membership.role} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push('/onboarding');
            }}
            className="flex w-full items-center gap-2 border-t border-line px-2.5 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2"
          >
            <Plus className="size-4" />
            New organization
          </button>
        </div>
      ) : null}
    </div>
  );
}
