'use client';

/**
 * Canvas node components.
 *
 * A step is a rounded card with its icon, name and type; a trigger is drawn with
 * a rounded left edge so it reads as the start of the flow. Branch nodes expose
 * two labelled outputs instead of one, which is what makes the true/false split
 * visible on the canvas rather than hidden in a config field.
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Loader2,
  Lock,
  PauseCircle,
  Play,
  SkipForward,
} from 'lucide-react';
import { StepIcon, TriggerIcon } from '@/components/step-icon';
import { duration } from '@/lib/format';
import { STEP_CATALOG, TRIGGER_CATALOG } from '@/lib/step-catalog';
import { triggerDisplayName, webhookSettings } from '@/lib/trigger-config';
import type { StepRunStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { handlesFor, type StepNodeData, type TriggerNodeData } from './graph-model';

const STATUS_RING: Record<StepRunStatus, string> = {
  pending: 'ring-line',
  running: 'ring-info',
  paused: 'ring-warn',
  completed: 'ring-ok',
  failed: 'ring-danger',
  skipped: 'ring-line',
};

function StatusPip({ status, attempts }: { status?: StepRunStatus; attempts?: number }) {
  if (!status || status === 'pending') return null;

  const icon =
    status === 'running' ? (
      <Loader2 className="size-3 animate-spin" />
    ) : status === 'completed' ? (
      <Check className="size-3" />
    ) : status === 'failed' ? (
      <AlertCircle className="size-3" />
    ) : status === 'paused' ? (
      <PauseCircle className="size-3" />
    ) : (
      <SkipForward className="size-3" />
    );

  const tone =
    status === 'completed'
      ? 'bg-ok text-white'
      : status === 'failed'
        ? 'bg-danger text-white'
        : status === 'paused'
          ? 'bg-warn text-white'
          : status === 'running'
            ? 'bg-info text-white'
            : 'bg-surface-2 text-ink-3';

  return (
    <span
      className={cn(
        'animate-pip absolute -top-2 -right-2 flex items-center gap-1 rounded-full px-1.5 py-1 shadow-sm',
        tone,
      )}
      title={status}
    >
      {icon}
      {attempts && attempts > 1 ? (
        <span className="text-[10px] leading-none font-semibold">{attempts}</span>
      ) : null}
    </span>
  );
}

const HANDLE_CLASS =
  '!size-2.5 !rounded-full !border-2 !border-canvas !bg-line-strong transition-colors hover:!bg-accent';

export const StepNode = memo(function StepNode({
  data,
  selected,
}: NodeProps<Node<StepNodeData, 'step'>>) {
  const { step, status, attempts, startedAt, finishedAt, locked, readOnly, isEntry, issues } = data;
  const errors = issues.filter((issue) => issue.severity === 'error');
  const worst = errors.length ? 'error' : issues.length ? 'warning' : null;
  const spec = STEP_CATALOG[step.type];
  const outputs = handlesFor(step.type);

  return (
    <div className="relative">
      <Handle
        type="target"
        id="in"
        position={Position.Left}
        isConnectable={!readOnly}
        className={HANDLE_CLASS}
      />

      <div
        className={cn(
          'node-card-enter relative w-52 overflow-hidden rounded-xl border bg-surface px-3 py-2.5 shadow-sm',
          'transition-[border-color,box-shadow,opacity] duration-300 ease-out',
          selected ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-strong',
          // An unconfigured node reads as a problem before it is ever run.
          !status && worst === 'error' && 'border-danger/60',
          !status && worst === 'warning' && 'border-warn/50',
          status ? `ring-2 ${STATUS_RING[status]}` : '',
          status === 'skipped' && 'opacity-50',
          // A step that is still working shows a moving sheen, so a slow LLM call
          // reads as "in progress" rather than as a frozen UI.
          status === 'running' && 'node-shimmer shadow-md',
        )}
      >
        <StatusPip status={status} attempts={attempts} />

        {worst && !status ? (
          <span
            className={cn(
              'group/issue absolute -top-2 -right-2 grid size-5 place-items-center rounded-full shadow-sm',
              worst === 'error' ? 'bg-danger text-white' : 'bg-warn text-white',
            )}
          >
            {worst === 'error' ? (
              <AlertCircle className="size-3" />
            ) : (
              <AlertTriangle className="size-3" />
            )}
            <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left text-[11px] leading-relaxed font-normal text-ink-2 opacity-0 shadow-xl transition-opacity group-hover/issue:visible group-hover/issue:opacity-100">
              {issues.map((issue) => (
                <span key={issue.message} className="block">
                  {issue.message}
                </span>
              ))}
            </span>
          </span>
        ) : null}

        <div className="flex items-start gap-2.5">
          <StepIcon
            type={step.type}
            withTone
            className={status === 'running' ? 'animate-step-pulse' : undefined}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] leading-tight font-medium text-ink">
              {step.name || spec.label}
            </p>
            <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] text-ink-3">
              {step.type}
              {locked ? <Lock className="size-2.5" /> : null}
            </p>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {isEntry ? (
            <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-ink">
              <Play className="size-2.5" />
              starts here
            </span>
          ) : null}
          {startedAt && status && status !== 'pending' && status !== 'skipped' ? (
            <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-3 tabular-nums">
              {duration(startedAt, finishedAt ?? null)}
            </span>
          ) : null}
        </div>
      </div>

      {outputs.map((handle, index) => {
        const offset = outputs.length === 1 ? 50 : index === 0 ? 32 : 68;
        return (
          <span key={handle}>
            <Handle
              type="source"
              id={handle}
              position={Position.Right}
              isConnectable={!readOnly}
              style={{ top: `${offset}%` }}
              className={cn(
                HANDLE_CLASS,
                handle === 'true' && '!bg-ok',
                handle === 'false' && '!bg-danger',
              )}
            />
            {handle !== 'main' ? (
              <span
                className={cn(
                  'pointer-events-none absolute left-full ml-2.5 -translate-y-1/2 text-[10px] font-semibold',
                  handle === 'true' ? 'text-ok' : 'text-danger',
                )}
                style={{ top: `${offset}%` }}
              >
                {handle}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
});

/**
 * The one line under a trigger's name that says how *this* trigger differs from
 * another of the same kind: its schedule, its verb and id, its source key.
 */
function triggerDetail(trigger: TriggerNodeData['trigger']): string {
  switch (trigger.type) {
    case 'scheduled':
      return trigger.cron_expression || 'no schedule set';
    case 'webhook': {
      const settings = webhookSettings(trigger.config);
      return trigger.id ? `${settings.method} · ${trigger.id.slice(0, 8)}` : `${settings.method} · unsaved`;
    }
    case 'database_event': {
      const source = typeof trigger.config?.source_key === 'string' ? trigger.config.source_key : '';
      return source ? `on “${source}”` : 'any watched row';
    }
    default:
      return 'Run button';
  }
}

export const TriggerNode = memo(function TriggerNode({
  data,
  selected,
}: NodeProps<Node<TriggerNodeData, 'trigger'>>) {
  const { trigger, workflowActive } = data;
  const spec = TRIGGER_CATALOG[trigger.type];
  const name = triggerDisplayName(trigger, spec.label);
  const external = trigger.type !== 'manual';
  const live = trigger.is_enabled && (external ? workflowActive : true);

  return (
    <div className="relative">
      <div
        className={cn(
          'node-card-enter flex w-48 items-center gap-2.5 rounded-r-xl rounded-l-[2rem] border bg-surface py-2.5 pr-3 pl-4 shadow-sm transition-all',
          selected ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-strong',
          !trigger.is_enabled && 'opacity-55',
        )}
      >
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full',
            live ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-3',
          )}
        >
          <TriggerIcon type={trigger.type} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight font-medium text-ink" title={name}>
            {name}
          </p>
          <p className="truncate font-mono text-[10px] text-ink-3">{triggerDetail(trigger)}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {!trigger.id ? (
            <span className="rounded bg-warn-soft px-1 py-0.5 text-[9px] font-semibold text-warn">
              NEW
            </span>
          ) : null}
          {external ? (
            <span
              title={live ? 'Live — accepting calls' : 'Not live'}
              className={cn('size-2 rounded-full', live ? 'animate-step-pulse bg-ok' : 'bg-ink-3')}
            />
          ) : null}
        </div>
      </div>

      <Handle
        type="source"
        id="main"
        position={Position.Right}
        isConnectable={false}
        className={cn(
          '!size-2.5 !rounded-full !border-2 !border-canvas',
          live ? '!bg-warn' : '!bg-line-strong',
        )}
      />
    </div>
  );
});

export const nodeTypes = { step: StepNode, trigger: TriggerNode };
