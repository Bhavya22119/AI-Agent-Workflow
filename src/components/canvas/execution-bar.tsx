'use client';

/**
 * The execution strip that appears in the editor while a run is being watched.
 *
 * Pressing Run keeps you on the canvas — the graph itself is the progress
 * indicator — so this bar carries the things the canvas cannot show: overall
 * status, elapsed time, which step is executing right now, and the approve /
 * reject controls when the run pauses at a gate.
 */
import { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { Badge, RunStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { StepIcon } from '@/components/step-icon';
import { duration } from '@/lib/format';
import { runAction, type StepDecisionResult } from '@/lib/actions';
import { STEP_CATALOG } from '@/lib/step-catalog';
import type { Json, OrgRole, RunStatus, StepRun } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ExecutionBar({
  runId,
  status,
  startedAt,
  finishedAt,
  error,
  stepRuns,
  role,
  onClose,
  connecting,
}: {
  runId: string;
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  stepRuns: StepRun[];
  role: OrgRole | null;
  onClose: () => void;
  connecting: boolean;
}) {
  // Re-render once a second so "elapsed" ticks while a run is in flight.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (finishedAt) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [finishedAt]);

  const done = stepRuns.filter((step) => step.status === 'completed').length;
  const total = stepRuns.length;
  const running = stepRuns.find((step) => step.status === 'running');
  const paused = stepRuns.find(
    (step) => step.status === 'paused' && step.step_type === 'approval_gate',
  );

  return (
    <div
      className={cn(
        'animate-fade-rise flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border px-3 py-2',
        status === 'paused'
          ? 'border-warn/40 bg-warn-soft/40'
          : status === 'failed' || status === 'cancelled'
            ? 'border-danger/40 bg-danger-soft/40'
            : status === 'completed'
              ? 'border-ok/40 bg-ok-soft/30'
              : 'border-info/40 bg-info-soft/30',
      )}
    >
      <div className="flex items-center gap-2">
        <RunStatusBadge status={status} />
        <span className="font-mono text-xs text-ink-3">{runId.slice(0, 8)}</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-ink-2">
        <span className="tabular-nums">
          {done}/{total} steps
        </span>
        <span className="tabular-nums">{duration(startedAt, finishedAt)}</span>
      </div>

      {connecting ? (
        <span className="flex items-center gap-1.5 text-xs text-ink-3">
          <Loader2 className="size-3.5 animate-spin" />
          connecting…
        </span>
      ) : running ? (
        <span className="flex items-center gap-1.5 text-xs text-info">
          <StepIcon type={running.step_type} className="size-3.5" />
          running {running.workflow_step?.name || STEP_CATALOG[running.step_type]?.label}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <Link
          href={`/runs/${runId}`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Full details
          <ExternalLink className="size-3" />
        </Link>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Stop watching this run">
          <X className="size-4" />
        </Button>
      </div>

      {error ? (
        <div className="w-full">
          <Alert tone={status === 'cancelled' ? 'warning' : 'danger'}>{error}</Alert>
        </div>
      ) : null}

      {paused ? (
        <div className="w-full">
          <ApprovalControls stepRun={paused} role={role} />
        </div>
      ) : null}
    </div>
  );
}

function ApprovalControls({ stepRun, role }: { stepRun: StepRun; role: OrgRole | null }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = (stepRun.workflow_step?.config ?? {}) as Record<string, Json>;
  const message =
    typeof config.message === 'string' && config.message
      ? config.message
      : 'This run is waiting for a human decision.';

  // Mirrors the handler: config may narrow who can approve, never widen it, so a
  // viewer is excluded whatever the config says.
  const configured = Array.isArray(config.approver_roles)
    ? config.approver_roles.map(String)
    : ['owner', 'editor'];
  const allowed: string[] = configured.filter((r) => r === 'owner' || r === 'editor');
  const canDecide = role !== null && allowed.includes(role);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    setError(null);
    try {
      await runAction<StepDecisionResult>(
        decision === 'approve' ? 'approveStep' : 'rejectStep',
        { step_run_id: stepRun.id, note: note.trim() || undefined },
      );
      // The subscription reports the resumed run; nothing to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that decision.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-warn/30 pt-2">
      <ShieldCheck className="size-4 shrink-0 text-warn" />
      <p className="min-w-0 flex-1 text-sm text-ink-2">
        {message}
        <span className="ml-1.5 text-xs text-ink-3">
          ({allowed.join(' or ')} may decide
          {canDecide ? '' : `; you are ${role ?? 'not a member'}`})
        </span>
      </p>

      {canDecide ? (
        <>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note"
            className="h-8 w-44 bg-surface text-xs"
          />
          <Button variant="success" size="sm" loading={busy === 'approve'} onClick={() => decide('approve')}>
            <Check className="size-3.5" />
            Approve
          </Button>
          <Button variant="secondary" size="sm" loading={busy === 'reject'} onClick={() => decide('reject')}>
            <X className="size-3.5" />
            Reject
          </Button>
        </>
      ) : (
        <Badge tone="bg-surface-2 text-ink-3">no permission to decide</Badge>
      )}

      {error ? (
        <div className="w-full">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
    </div>
  );
}
