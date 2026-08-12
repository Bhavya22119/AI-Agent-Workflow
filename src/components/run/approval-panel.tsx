'use client';

import { useState } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { runAction, type StepDecisionResult } from '@/lib/actions';
import type { Json, OrgRole, StepRun } from '@/lib/types';

/**
 * The pause/approve UI, shown inline on the paused step.
 *
 * The buttons are hidden for a viewer, and for a role the gate's own config does
 * not allow — but that is presentation only. approveStep re-checks the caller's
 * role in the run's organization before it records anything, so a viewer calling
 * the mutation directly is refused, and so is an Org B editor who somehow
 * obtained this step_run_id.
 */
export function ApprovalPanel({
  stepRun,
  role,
  onDecided,
}: {
  stepRun: StepRun;
  role: OrgRole | null;
  onDecided: (result: StepDecisionResult) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = (stepRun.workflow_step?.config ?? {}) as Record<string, Json>;
  const message =
    typeof config.message === 'string' && config.message
      ? config.message
      : 'This run is waiting for a human decision.';

  const configuredRoles = Array.isArray(config.approver_roles)
    ? config.approver_roles.map(String)
    : ['owner', 'editor'];
  // Mirrors the handler: config may narrow who can approve, never widen it, so a
  // viewer is excluded whatever the step config says.
  const allowedRoles: string[] = configuredRoles.filter(
    (value) => value === 'owner' || value === 'editor',
  );
  const canDecide = role !== null && allowedRoles.includes(role);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    setError(null);
    try {
      const result = await runAction<StepDecisionResult>(
        decision === 'approve' ? 'approveStep' : 'rejectStep',
        { step_run_id: stepRun.id, note: note.trim() || undefined },
      );
      onDecided(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that decision.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-warn/30 bg-warn-soft/50 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warn" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-ink">Awaiting approval</p>
            <p className="mt-0.5 text-sm text-ink-2">{message}</p>
            <p className="mt-1 text-xs text-ink-3">
              Allowed to decide: {allowedRoles.join(' or ')}
              {canDecide ? '' : ` — you are ${role ?? 'not a member'}, so you cannot.`}
            </p>
          </div>

          {canDecide ? (
            <>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional note recorded with your decision"
                className="bg-surface"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="success"
                  size="sm"
                  loading={busy === 'approve'}
                  onClick={() => decide('approve')}
                >
                  <Check className="size-3.5" />
                  Approve and continue
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === 'reject'}
                  onClick={() => decide('reject')}
                >
                  <X className="size-3.5" />
                  Reject
                </Button>
              </div>
            </>
          ) : null}

          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      </div>
    </div>
  );
}
