'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { RUN_STATUS_LABEL, STEP_STATUS_LABEL, statusTone } from '@/lib/format';
import type { OrgRole, RunStatus, StepRunStatus } from '@/lib/types';

export function Badge({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tone ?? 'bg-surface-2 text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function RunStatusBadge({
  status,
  className,
}: {
  status: RunStatus;
  className?: string;
}) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {status === 'running' ? <span className="size-1.5 rounded-full bg-current animate-step-pulse" /> : null}
      {RUN_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function StepStatusBadge({
  status,
  className,
}: {
  status: StepRunStatus;
  className?: string;
}) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {status === 'running' ? <span className="size-1.5 rounded-full bg-current animate-step-pulse" /> : null}
      {STEP_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const ROLE_TONE: Record<OrgRole, string> = {
  owner: 'bg-accent-soft text-accent-ink',
  editor: 'bg-info-soft text-info',
  viewer: 'bg-surface-2 text-ink-3',
};

export function RoleBadge({ role, className }: { role: OrgRole; className?: string }) {
  return (
    <Badge tone={ROLE_TONE[role]} className={className}>
      {role}
    </Badge>
  );
}
