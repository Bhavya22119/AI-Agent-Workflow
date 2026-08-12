'use client';

import { useState } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { StepIcon } from '@/components/step-icon';
import { Badge, StepStatusBadge } from '@/components/ui/badge';
import { JsonBlock } from '@/components/ui/surface';
import { duration, prettyJson, summarizeOutput } from '@/lib/format';
import { STEP_CATALOG } from '@/lib/step-catalog';
import type { StepRun } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The live timeline. Every field here comes from the step_runs subscription, so
 * the sequence a reviewer sees — queued, running, done, paused, skipped — is the
 * database's own record of the run, updated as the engine writes it.
 */
export function StepTimeline({
  stepRuns,
  children,
}: {
  stepRuns: StepRun[];
  /** Rendered under the step it belongs to (the approval panel). */
  children?: (stepRun: StepRun) => React.ReactNode;
}) {
  return (
    <ol className="space-y-2">
      {stepRuns.map((stepRun, index) => (
        <StepTimelineRow
          key={stepRun.id}
          stepRun={stepRun}
          isLast={index === stepRuns.length - 1}
          extra={children?.(stepRun)}
        />
      ))}
    </ol>
  );
}

function StepTimelineRow({
  stepRun,
  isLast,
  extra,
}: {
  stepRun: StepRun;
  isLast: boolean;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const spec = STEP_CATALOG[stepRun.step_type];
  const label = stepRun.workflow_step?.name || spec?.label || stepRun.step_type;
  const summary = summarizeOutput(stepRun.output);
  const skipped = stepRun.status === 'skipped';

  return (
    <li className="relative">
      {!isLast ? (
        <span
          aria-hidden
          className="absolute top-11 left-[27px] h-[calc(100%-1.5rem)] w-px bg-line"
        />
      ) : null}

      <div
        className={cn(
          'rounded-card border bg-surface transition-colors',
          stepRun.status === 'paused'
            ? 'border-warn/40'
            : stepRun.status === 'failed'
              ? 'border-danger/40'
              : 'border-line',
          skipped && 'opacity-60',
        )}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="w-4 shrink-0 text-center text-xs tabular-nums text-ink-3">
            {stepRun.position}
          </span>
          <StepIcon
            type={stepRun.step_type}
            withTone
            className={stepRun.status === 'running' ? 'animate-step-pulse' : undefined}
          />

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="min-w-0 flex-1 text-left"
            aria-expanded={open}
          >
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-ink">{label}</span>
              {stepRun.attempt_count > 1 ? (
                <Badge tone="bg-warn-soft text-warn">
                  <RotateCcw className="size-3" />
                  attempt {stepRun.attempt_count}
                </Badge>
              ) : null}
            </span>
            <span className="block truncate text-xs text-ink-3">
              {stepRun.error
                ? stepRun.error
                : (summary ?? (skipped ? 'Not on the path this run took' : spec?.label))}
            </span>
          </button>

          <span className="hidden shrink-0 text-xs tabular-nums text-ink-3 sm:block">
            {stepRun.started_at ? duration(stepRun.started_at, stepRun.finished_at) : ''}
          </span>
          <StepStatusBadge status={stepRun.status} />
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-ink-3 transition-transform',
              open && 'rotate-90',
            )}
          />
        </div>

        {open ? (
          <div className="animate-fade-rise space-y-3 border-t border-line px-3 py-3">
            {stepRun.error ? (
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-danger uppercase">Error</p>
                <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                  {stepRun.error}
                </p>
              </div>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-ink-3 uppercase">
                  Input (rendered config)
                </p>
                <JsonBlock text={prettyJson(stepRun.input) || '—'} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-ink-3 uppercase">Output</p>
                <JsonBlock text={prettyJson(stepRun.output) || '—'} />
              </div>
            </div>
            {stepRun.approved_at ? (
              <p className="text-xs text-ink-3">
                Approved by{' '}
                <span className="font-medium text-ink-2">
                  {stepRun.approver?.displayName || stepRun.approver?.email || stepRun.approved_by}
                </span>{' '}
                at {new Date(stepRun.approved_at).toLocaleTimeString()}
                {stepRun.decision_note ? ` — “${stepRun.decision_note}”` : ''}
              </p>
            ) : null}
            {stepRun.rejected_at ? (
              <p className="text-xs text-danger">
                Rejected at {new Date(stepRun.rejected_at).toLocaleTimeString()}
                {stepRun.decision_note ? ` — “${stepRun.decision_note}”` : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        {extra}
      </div>
    </li>
  );
}
