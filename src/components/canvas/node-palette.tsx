'use client';

/**
 * The "add a node" panel: a searchable list of step and trigger types, opened
 * from the toolbar or by dropping a connection onto empty canvas.
 *
 * Types the caller's role may not create are shown but disabled, with the reason
 * — an editor should be able to see that db_write exists and that it is
 * owner-only, rather than wondering why it is missing.
 */
import { useMemo, useState } from 'react';
import { Lock, Search, X } from 'lucide-react';
import { StepIcon, TriggerIcon } from '@/components/step-icon';
import { Input } from '@/components/ui/field';
import {
  STEP_CATALOG,
  STEP_ORDER,
  TRIGGER_CATALOG,
  TRIGGER_ORDER,
} from '@/lib/step-catalog';
import type { StepType, TriggerType } from '@/lib/types';
import { cn } from '@/lib/utils';

export function NodePalette({
  open,
  onClose,
  canUseStepType,
  canUseTriggerType,
  hasManualTrigger,
  onAddStep,
  onAddTrigger,
  /** Set when the panel was opened by dragging a connection into empty space. */
  connectingFrom,
}: {
  open: boolean;
  onClose: () => void;
  canUseStepType: (type: StepType) => boolean;
  canUseTriggerType: (type: TriggerType) => boolean;
  hasManualTrigger: boolean;
  onAddStep: (type: StepType) => void;
  onAddTrigger: (type: TriggerType) => void;
  connectingFrom?: { key: string; handle: string } | null;
}) {
  const [query, setQuery] = useState('');

  const steps = useMemo(
    () =>
      STEP_ORDER.filter((type) => {
        const spec = STEP_CATALOG[type];
        const haystack = `${type} ${spec.label} ${spec.blurb}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      }),
    [query],
  );

  const triggers = useMemo(
    () =>
      TRIGGER_ORDER.filter((type) => {
        const spec = TRIGGER_CATALOG[type];
        const haystack = `${type} ${spec.label} ${spec.blurb}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      }),
    [query],
  );

  if (!open) return null;

  return (
    <aside className="animate-panel-in absolute top-0 right-0 bottom-0 z-20 flex w-96 flex-col border-l border-line bg-surface shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Add a node</h2>
          <p className="text-xs text-ink-3">
            {connectingFrom
              ? `It will be connected to “${connectingFrom.key}”.`
              : 'Click to place it on the canvas.'}
          </p>
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

      <div className="border-b border-line p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search nodes"
            className="pl-8"
          />
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <PaletteSection title="Steps">
          {steps.map((type) => {
            const spec = STEP_CATALOG[type];
            const allowed = canUseStepType(type);
            return (
              <PaletteItem
                key={type}
                allowed={allowed}
                onSelect={() => onAddStep(type)}
                icon={<StepIcon type={type} withTone />}
                title={spec.label}
                mono={type}
                blurb={spec.blurb}
                reason={allowed ? undefined : 'Only an owner can add this step type'}
              />
            );
          })}
          {steps.length === 0 ? <PaletteEmpty /> : null}
        </PaletteSection>

        {connectingFrom ? null : (
          <PaletteSection title="Triggers">
            {triggers.map((type) => {
              const spec = TRIGGER_CATALOG[type];
              const duplicateManual = type === 'manual' && hasManualTrigger;
              const allowed = canUseTriggerType(type) && !duplicateManual;
              return (
                <PaletteItem
                  key={type}
                  allowed={allowed}
                  onSelect={() => onAddTrigger(type)}
                  icon={
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                      <TriggerIcon type={type} />
                    </span>
                  }
                  title={spec.label}
                  mono={type}
                  blurb={spec.blurb}
                  reason={
                    duplicateManual
                      ? 'This workflow already has a manual trigger'
                      : allowed
                        ? undefined
                        : 'Only an owner can add this trigger type'
                  }
                />
              );
            })}
            {triggers.length === 0 ? <PaletteEmpty /> : null}
          </PaletteSection>
        )}
      </div>
    </aside>
  );
}

function PaletteSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="sticky top-0 bg-surface px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
        {title}
      </h3>
      <div className="pb-2">{children}</div>
    </section>
  );
}

function PaletteEmpty() {
  return <p className="px-3 py-2 text-xs text-ink-3">Nothing matches that search.</p>;
}

function PaletteItem({
  allowed,
  onSelect,
  icon,
  title,
  mono,
  blurb,
  reason,
}: {
  allowed: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  mono: string;
  blurb: string;
  reason?: string;
}) {
  return (
    <button
      type="button"
      disabled={!allowed}
      onClick={onSelect}
      title={reason}
      className={cn(
        'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
        allowed ? 'hover:bg-surface-2' : 'cursor-not-allowed opacity-55',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {title}
          {allowed ? null : <Lock className="size-3 text-ink-3" />}
        </span>
        <span className="block font-mono text-[10px] text-ink-3">{mono}</span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-3">{reason ?? blurb}</span>
      </span>
    </button>
  );
}
