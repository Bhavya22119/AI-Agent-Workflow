'use client';

import {
  Bell,
  Brain,
  Clock,
  Database,
  GitBranch,
  Globe,
  MousePointerClick,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEP_CATALOG } from '@/lib/step-catalog';
import type { StepType, TriggerType } from '@/lib/types';

const STEP_ICONS: Record<StepType, typeof Brain> = {
  llm_call: Brain,
  http_request: Globe,
  db_write: Database,
  notify: Bell,
  conditional_branch: GitBranch,
  approval_gate: ShieldCheck,
};

const TRIGGER_ICONS: Record<TriggerType, typeof Brain> = {
  manual: MousePointerClick,
  webhook: Webhook,
  scheduled: Clock,
  database_event: Database,
};

export function StepIcon({
  type,
  className,
  withTone = false,
}: {
  type: StepType;
  className?: string;
  withTone?: boolean;
}) {
  const Icon = STEP_ICONS[type];
  if (!withTone) return <Icon className={cn('size-4', className)} aria-hidden />;
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg',
        STEP_CATALOG[type].tone,
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

export function TriggerIcon({ type, className }: { type: TriggerType; className?: string }) {
  const Icon = TRIGGER_ICONS[type];
  return <Icon className={cn('size-4', className)} aria-hidden />;
}
