/**
 * triggerWorkflowRun — the manual trigger.
 *
 * Authorization happens twice on purpose:
 *   1. here in the handler (requireOrgRole), which produces a clear error and is
 *      the check the assignment asks for explicitly;
 *   2. again inside start_workflow_run() in Postgres, in the same transaction
 *      that creates the run, so even a future caller that forgot step 1 cannot
 *      create a run for an org the user does not belong to.
 */
import { after } from 'next/server';
import { requireOrgRole, requireUserId, type Caller } from '../auth';
import { runInBackground } from '../engine/runner';
import { startRun } from '../engine/store';
import type { Json } from '../engine/types';
import { countStepRuns, loadWorkflow, requireUuid } from './shared';

export interface TriggerWorkflowRunInput {
  workflow_id: string;
  payload?: Json;
}

export interface TriggerRunOutput {
  workflow_run_id: string;
  workflow_id: string;
  status: string;
  step_count: number;
}

export async function triggerWorkflowRun(
  input: TriggerWorkflowRunInput,
  caller: Caller,
): Promise<TriggerRunOutput> {
  const userId = requireUserId(caller);
  const workflowId = requireUuid(input.workflow_id, 'workflow_id');

  const workflow = await loadWorkflow(workflowId);
  // Layer 1: viewers are rejected here; non-members get the same opaque error as
  // a non-existent workflow.
  await requireOrgRole(userId, workflow.org_id, ['owner', 'editor']);

  const run = await startRun({
    workflowId,
    userId,
    triggerType: 'manual',
    payload: input.payload ?? {},
    requireRole: true,
  });

  const stepCount = await countStepRuns(run.id);

  // Hand execution to the background so the mutation returns immediately and the
  // client can watch progress over the step_runs subscription instead of waiting
  // on an HTTP response for the whole workflow.
  after(() => runInBackground(run.id));

  return {
    workflow_run_id: run.id,
    workflow_id: workflowId,
    status: 'running',
    step_count: stepCount,
  };
}
