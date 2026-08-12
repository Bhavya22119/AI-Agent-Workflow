/**
 * approveStep / rejectStep — clearing a paused approval_gate.
 *
 * This is the case the assignment singles out: it cannot be a database
 * permission, because it is a decision about a run that is already in flight,
 * not a row read or write. So the handler itself performs the check.
 *
 * What is verified, in order:
 *   1. the caller is authenticated (identity from the verified JWT / session
 *      variables, never from the request body);
 *   2. the step_run exists — and if it belongs to another organization the
 *      caller gets exactly the same error as if it did not exist, so guessing
 *      UUIDs reveals nothing;
 *   3. the caller's role in *that step's* organization is allowed to approve.
 *      The step's own config may narrow this (e.g. owner-only gates) but can
 *      never widen it: a viewer can never approve, whatever the config says;
 *   4. the step really is an approval_gate and really is paused;
 *   5. the state transition is applied with `status = paused` still in the WHERE
 *      clause, so if two approvers race, exactly one wins and the other is told
 *      the gate already moved.
 */
import { after } from 'next/server';
import { ActionError, requireOrgRole, requireUserId, type Caller, type OrgRole } from '../auth';
import { runInBackground } from '../engine/runner';
import {
  consumeRunQuota,
  loadStepRunForDecision,
  markUnreachedStepsSkipped,
  recordApproval,
  recordRejection,
  setRunStatus,
} from '../engine/store';
import { approverRolesFor } from '../engine/steps';
import { OPAQUE_NOT_FOUND, optionalString, requireUuid } from './shared';

export interface StepDecisionInput {
  step_run_id: string;
  note?: string | null;
}

export interface StepDecisionOutput {
  step_run_id: string;
  workflow_run_id: string;
  decision: string;
  run_status: string;
}

/**
 * Roles allowed to clear a gate: the step's configured list, intersected with
 * the roles the product allows to approve at all. Configuration can tighten the
 * rule, never loosen it.
 */
function allowedApproverRoles(config: Record<string, unknown>): OrgRole[] {
  const configured = approverRolesFor(config as never);
  const allowed = configured.filter(
    (role): role is 'owner' | 'editor' => role === 'owner' || role === 'editor',
  );
  return allowed.length ? allowed : ['owner', 'editor'];
}

async function decide(
  input: StepDecisionInput,
  caller: Caller,
  decision: 'approved' | 'rejected',
): Promise<StepDecisionOutput> {
  const userId = requireUserId(caller);
  const stepRunId = requireUuid(input.step_run_id, 'step_run_id');
  const note = optionalString(input.note);

  const stepRun = await loadStepRunForDecision(stepRunId);
  if (!stepRun) {
    throw new ActionError('NOT_FOUND', OPAQUE_NOT_FOUND, 404);
  }

  const orgId = stepRun.workflow_run.org_id;
  const runId = stepRun.workflow_run.id;

  // Layer 1 + Layer 2, in the handler, against the org that owns this step.
  await requireOrgRole(userId, orgId, allowedApproverRoles(stepRun.workflow_step.config));

  if (stepRun.step_type !== 'approval_gate') {
    throw new ActionError(
      'NOT_AN_APPROVAL_GATE',
      `Step "${stepRun.workflow_step.name || stepRun.step_type}" is not an approval gate.`,
      400,
    );
  }
  if (stepRun.status !== 'paused') {
    throw new ActionError(
      'NOT_PAUSED',
      `This step is ${stepRun.status}, not awaiting approval.`,
      409,
    );
  }
  if (stepRun.workflow_run.status !== 'paused') {
    throw new ActionError(
      'RUN_NOT_PAUSED',
      `The run is ${stepRun.workflow_run.status}, not awaiting approval.`,
      409,
    );
  }

  if (decision === 'approved') {
    const won = await recordApproval({ stepRunId, userId, note });
    if (!won) {
      throw new ActionError(
        'ALREADY_DECIDED',
        'Someone else just decided this step.',
        409,
      );
    }
    // Resume from the first still-pending step, which is the one after the gate.
    after(() => runInBackground(runId));
    return {
      step_run_id: stepRunId,
      workflow_run_id: runId,
      decision: 'approved',
      run_status: 'running',
    };
  }

  const won = await recordRejection({ stepRunId, userId, note });
  if (!won) {
    throw new ActionError('ALREADY_DECIDED', 'Someone else just decided this step.', 409);
  }
  // The rest of the graph will never run, so record that rather than leaving
  // those steps `pending` forever — the canvas and the timeline should show the
  // run as finished, not as though it were still going.
  await markUnreachedStepsSkipped(runId);
  await setRunStatus(runId, 'cancelled', {
    error: `Rejected at the approval gate${note ? `: ${note}` : ''}`,
    finished: true,
  });
  await consumeRunQuota(runId);

  return {
    step_run_id: stepRunId,
    workflow_run_id: runId,
    decision: 'rejected',
    run_status: 'cancelled',
  };
}

export function approveStep(
  input: StepDecisionInput,
  caller: Caller,
): Promise<StepDecisionOutput> {
  return decide(input, caller, 'approved');
}

export function rejectStep(
  input: StepDecisionInput,
  caller: Caller,
): Promise<StepDecisionOutput> {
  return decide(input, caller, 'rejected');
}
