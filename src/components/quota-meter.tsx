'use client';

import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UsageSummary } from '@/lib/types';

/**
 * Quota indicator, fed by the org_usage_summary view (the aggregation).
 *
 * The number shown is the same one the engine enforces: runs consumed this
 * period out of the org's limit. In-flight runs also count towards the limit when
 * a new run is requested, which is why a run can be refused while this reads
 * just under the cap.
 */
export function QuotaMeter({
  usage,
  compact = false,
  className,
}: {
  usage: UsageSummary | null;
  compact?: boolean;
  className?: string;
}) {
  if (!usage) return null;

  const pct = Math.min(100, Math.max(0, Number(usage.quota_used_pct) || 0));
  const exhausted = usage.quota_remaining <= 0;
  const nearLimit = pct >= 80 && !exhausted;
  const barTone = exhausted ? 'bg-danger' : nearLimit ? 'bg-warn' : 'bg-accent';

  if (compact) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-ink-3">
            <Gauge className="size-3.5" />
            Run quota
          </span>
          <span className="font-medium tabular-nums text-ink-2">
            {usage.quota_used}/{usage.quota_limit}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', barTone)}
            style={{ width: `${pct}%` }}
          />
        </div>
        {exhausted ? (
          <p className="text-[11px] text-danger">Quota exhausted — new runs are refused.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('rounded-card border border-line bg-surface p-4', className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">
          Runs this period
        </p>
        <p className="text-xs text-ink-3">
          resets {new Date(usage.period_end).toLocaleDateString()}
        </p>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
        {usage.quota_used}
        <span className="text-base font-normal text-ink-3"> / {usage.quota_limit}</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', barTone)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={usage.quota_used}
          aria-valuemin={0}
          aria-valuemax={usage.quota_limit}
        />
      </div>
      <p className={cn('mt-2 text-xs', exhausted ? 'text-danger' : 'text-ink-3')}>
        {exhausted
          ? 'Quota exhausted — triggering a run returns QUOTA_EXCEEDED.'
          : `${usage.quota_remaining} remaining · ${usage.runs_active} in flight`}
      </p>
    </div>
  );
}
