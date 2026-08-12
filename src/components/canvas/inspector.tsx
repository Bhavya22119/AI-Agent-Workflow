'use client';

/**
 * The inspector: the right-hand panel that configures whichever node is
 * selected. Steps reuse the field-driven editor from the catalog; triggers get
 * their own controls plus the webhook endpoint reveal.
 */
import { Trash2, X } from 'lucide-react';
import { StepIcon, TriggerIcon } from '@/components/step-icon';
import { StepConfigEditor } from '@/components/builder/step-config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mono } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { STEP_CATALOG, TRIGGER_CATALOG } from '@/lib/step-catalog';
import type { DraftStep, DraftTrigger } from '@/lib/types';
import { TriggerConfig } from './trigger-inspector';

export function StepInspector({
  step,
  locked,
  onChange,
  onDelete,
  onClose,
}: {
  step: DraftStep;
  locked: boolean;
  onChange: (next: DraftStep) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const spec = STEP_CATALOG[step.type];

  return (
    <InspectorShell
      icon={<StepIcon type={step.type} withTone />}
      title={step.name || spec.label}
      subtitle={
        <span className="flex items-center gap-1.5">
          <Mono>{step.type}</Mono>
          <Mono>{step.key}</Mono>
        </span>
      }
      onClose={onClose}
      footer={
        locked ? null : (
          <Button variant="ghost" className="text-danger" onClick={onDelete}>
            <Trash2 className="size-4" />
            Delete node
          </Button>
        )
      }
    >
      {locked ? (
        <Alert tone="warning" className="mb-4">
          Only an owner can change a {spec.label.toLowerCase()} node. The database will reject a
          save that modifies it.
        </Alert>
      ) : null}

      {step.type === 'conditional_branch' ? (
        <Alert tone="info" className="mb-4">
          Drag from this node&apos;s <span className="font-medium text-ok">true</span> and{' '}
          <span className="font-medium text-danger">false</span> outputs on the canvas to choose
          where each result goes.
        </Alert>
      ) : null}

      <StepConfigEditor spec={spec} step={step} disabled={locked} onChange={onChange} />
    </InspectorShell>
  );
}

export function TriggerInspector({
  trigger,
  orgId,
  locked,
  workflowActive,
  onChange,
  onDelete,
  onClose,
  onListen,
}: {
  trigger: DraftTrigger;
  orgId: string;
  locked: boolean;
  workflowActive: boolean;
  onChange: (next: DraftTrigger) => void;
  onDelete: () => void;
  onClose: () => void;
  onListen?: (triggerType: string) => void;
}) {
  const spec = TRIGGER_CATALOG[trigger.type];

  return (
    <InspectorShell
      icon={
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
          <TriggerIcon type={trigger.type} />
        </span>
      }
      title={`${spec.label} trigger`}
      subtitle={<Mono>{trigger.type}</Mono>}
      onClose={onClose}
      footer={
        locked ? null : (
          <Button variant="ghost" className="text-danger" onClick={onDelete}>
            <Trash2 className="size-4" />
            Remove trigger
          </Button>
        )
      }
    >
      <TriggerConfig
        trigger={trigger}
        orgId={orgId}
        locked={locked}
        workflowActive={workflowActive}
        onChange={onChange}
        onListen={onListen}
      />
    </InspectorShell>
  );
}

function InspectorShell({
  icon,
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <aside className="animate-panel-in absolute top-0 right-0 bottom-0 z-20 flex w-[28rem] max-w-full flex-col border-l border-line bg-surface shadow-2xl">
      <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
            {subtitle ? <div className="mt-0.5 text-[11px] text-ink-3">{subtitle}</div> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-3 py-3">{children}</div>

      {footer ? (
        <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
          <Badge>changes save with the workflow</Badge>
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
