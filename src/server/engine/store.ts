/**
 * Every database operation the engine performs, in one place.
 *
 * All of these use the admin secret, because workflow_runs / step_runs /
 * workflow_outputs / notifications grant no write permission to any Hasura role.
 * That is deliberate: the engine is the only writer, so a client cannot fabricate
 * a run, skip the quota check, or flip a paused step to completed.
 */
import { adminGraphql } from '../hasura';
import type {
  Json,
  LoadedRun,
  LoadedStep,
  RunStatus,
  StepRunStatus,
  TriggerType,
} from './types';

const RUN_FIELDS = `
  id
  workflow_id
  org_id
  status
  trigger_type
  trigger_payload
  context
`;

const STEP_FIELDS = `
  id
  workflow_step_id
  position
  step_type
  status
  output
  workflow_step {
    key
    name
    config
    next
    retry_limit
    timeout_ms
  }
`;

export async function loadRun(runId: string): Promise<LoadedRun | null> {
  const data = await adminGraphql<{ workflow_runs_by_pk: LoadedRun | null }>(
    `query LoadRun($id: uuid!) {
       workflow_runs_by_pk(id: $id) {
         ${RUN_FIELDS}
         step_runs(order_by: { position: asc }) { ${STEP_FIELDS} }
       }
     }`,
    { id: runId },
  );
  return data.workflow_runs_by_pk;
}

/** A named failure raised by start_workflow_run(). */
export class RunStartError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RunStartError';
  }
}

const RUN_START_MESSAGES: Record<string, string> = {
  WORKFLOW_NOT_FOUND: 'Workflow not found, or you do not have access to it.',
  WORKFLOW_INACTIVE: 'This workflow is paused. Re-activate it before running.',
  WORKFLOW_HAS_NO_STEPS: 'This workflow has no steps yet, so there is nothing to run.',
  NOT_A_MEMBER: 'Workflow not found, or you do not have access to it.',
  ROLE_CANNOT_RUN: 'Your role is not allowed to trigger runs. Required: owner or editor.',
  QUOTA_EXCEEDED:
    'Monthly run quota exhausted for this organization (in-flight runs count towards it).',
};

/**
 * Digs the original Postgres error message out of a Hasura GraphQL error, so a
 * `RAISE EXCEPTION 'QUOTA_EXCEEDED'` becomes a code rather than the opaque
 * "postgres query error" that Hasura puts in `message`.
 */
function pgErrorCode(error: unknown): string | null {
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return null;
  for (const entry of errors) {
    const internal = (entry as { extensions?: { internal?: { error?: { message?: string } } } })
      .extensions?.internal?.error?.message;
    if (typeof internal === 'string') {
      const match = internal.match(/[A-Z_]{4,}/);
      if (match && RUN_START_MESSAGES[match[0]]) return match[0];
    }
  }
  return null;
}

/**
 * Creates a run through the start_workflow_run() Postgres function, which does
 * the role check, the quota check and the insert of the run plus all of its
 * step_runs in a single transaction under a row lock on the organization.
 */
export async function startRun(params: {
  workflowId: string;
  userId: string | null;
  triggerType: TriggerType;
  payload: Json;
  requireRole: boolean;
}): Promise<{ id: string; status: RunStatus; org_id: string; workflow_id: string }> {
  const data = await runStartMutation(params);
  const run = data.start_workflow_run[0];
  if (!run) throw new RunStartError('UNKNOWN', 'The run could not be created.');
  return run;
}

async function runStartMutation(params: {
  workflowId: string;
  userId: string | null;
  triggerType: TriggerType;
  payload: Json;
  requireRole: boolean;
}): Promise<{
  start_workflow_run: Array<{
    id: string;
    status: RunStatus;
    org_id: string;
    workflow_id: string;
  }>;
}> {
  try {
    return await adminGraphql<{
      start_workflow_run: Array<{
        id: string;
        status: RunStatus;
        org_id: string;
        workflow_id: string;
      }>;
    }>(
      `mutation StartRun(
       $workflowId: uuid!
       $userId: uuid
       $triggerType: trigger_type!
       $payload: jsonb!
       $requireRole: Boolean!
     ) {
       start_workflow_run(
         args: {
           p_workflow_id: $workflowId
           p_user_id: $userId
           p_trigger_type: $triggerType
           p_payload: $payload
           p_require_role: $requireRole
         }
       ) {
         id
         status
         org_id
         workflow_id
       }
     }`,
      {
        workflowId: params.workflowId,
        userId: params.userId,
        triggerType: params.triggerType,
        payload: params.payload ?? {},
        requireRole: params.requireRole,
      },
    );
  } catch (error) {
    const code = pgErrorCode(error);
    if (code) throw new RunStartError(code, RUN_START_MESSAGES[code]);
    throw error;
  }
}

/**
 * Optimistic lock: moves a run from pending/paused to running and reports
 * whether this caller won. Two concurrent workers (a double-clicked Approve, or
 * a webhook and the scheduler firing together) therefore cannot both drive the
 * same run — the loser sees affected_rows = 0 and returns immediately.
 */
export async function claimRun(runId: string): Promise<boolean> {
  const data = await adminGraphql<{ update_workflow_runs: { affected_rows: number } }>(
    `mutation ClaimRun($id: uuid!) {
       update_workflow_runs(
         where: { id: { _eq: $id }, status: { _in: [pending, paused] } }
         _set: { status: running }
       ) { affected_rows }
     }`,
    { id: runId },
  );
  return data.update_workflow_runs.affected_rows === 1;
}

export async function setRunStatus(
  runId: string,
  status: RunStatus,
  extra: { error?: string | null; finished?: boolean } = {},
): Promise<void> {
  await adminGraphql(
    `mutation SetRunStatus($id: uuid!, $set: workflow_runs_set_input!) {
       update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
     }`,
    {
      id: runId,
      set: {
        status,
        ...(extra.error !== undefined ? { error: extra.error } : {}),
        ...(extra.finished ? { finished_at: new Date().toISOString() } : {}),
      },
    },
  );
}

export async function setStepRunStatus(
  stepRunId: string,
  status: StepRunStatus,
  extra: {
    input?: Json;
    output?: Json;
    error?: string | null;
    attemptCount?: number;
    started?: boolean;
    finished?: boolean;
  } = {},
): Promise<void> {
  await adminGraphql(
    `mutation SetStepRunStatus($id: uuid!, $set: step_runs_set_input!) {
       update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
     }`,
    {
      id: stepRunId,
      set: {
        status,
        ...(extra.input !== undefined ? { input: extra.input } : {}),
        ...(extra.output !== undefined ? { output: extra.output } : {}),
        ...(extra.error !== undefined ? { error: extra.error } : {}),
        ...(extra.attemptCount !== undefined ? { attempt_count: extra.attemptCount } : {}),
        ...(extra.started ? { started_at: new Date().toISOString() } : {}),
        ...(extra.finished ? { finished_at: new Date().toISOString() } : {}),
      },
    },
  );
}

/**
 * Marks every step the run never reached as skipped, so the canvas and the
 * timeline show the path actually taken rather than leaving nodes stuck at
 * `pending` forever. Called once when the run finishes.
 */
export async function markUnreachedStepsSkipped(runId: string): Promise<number> {
  const data = await adminGraphql<{ update_step_runs: { affected_rows: number } }>(
    `mutation SkipUnreached($runId: uuid!) {
       update_step_runs(
         where: { workflow_run_id: { _eq: $runId }, status: { _eq: pending } }
         _set: { status: skipped, finished_at: "now()" }
       ) { affected_rows }
     }`,
    { runId },
  );
  return data.update_step_runs.affected_rows;
}

export async function insertWorkflowOutput(params: {
  orgId: string;
  runId: string;
  stepRunId: string;
  key: string;
  value: Json;
}): Promise<string> {
  const data = await adminGraphql<{ insert_workflow_outputs_one: { id: string } }>(
    `mutation InsertOutput($object: workflow_outputs_insert_input!) {
       insert_workflow_outputs_one(object: $object) { id }
     }`,
    {
      object: {
        org_id: params.orgId,
        workflow_run_id: params.runId,
        step_run_id: params.stepRunId,
        key: params.key,
        value: params.value,
      },
    },
  );
  return data.insert_workflow_outputs_one.id;
}

export async function insertNotification(params: {
  orgId: string;
  runId: string;
  stepRunId: string;
  channel: 'slack' | 'email' | 'log';
  target: string | null;
  subject: string | null;
  body: string;
}): Promise<string> {
  const data = await adminGraphql<{ insert_notifications_one: { id: string } }>(
    `mutation InsertNotification($object: notifications_insert_input!) {
       insert_notifications_one(object: $object) { id }
     }`,
    {
      object: {
        org_id: params.orgId,
        workflow_run_id: params.runId,
        step_run_id: params.stepRunId,
        channel: params.channel,
        target: params.target,
        subject: params.subject,
        body: params.body,
      },
    },
  );
  return data.insert_notifications_one.id;
}

/** Increments the org quota for a finished run, at most once per run. */
export async function consumeRunQuota(
  runId: string,
): Promise<{ counted: boolean; quotaUsed?: number; quotaLimit?: number }> {
  const data = await adminGraphql<{
    consume_run_quota: Array<{ quota_used: number; quota_limit: number }>;
  }>(
    `mutation ConsumeQuota($runId: uuid!) {
       consume_run_quota(args: { p_run_id: $runId }) {
         quota_used
         quota_limit
       }
     }`,
    { runId },
  );
  const org = data.consume_run_quota[0];
  return org
    ? { counted: true, quotaUsed: org.quota_used, quotaLimit: org.quota_limit }
    : { counted: false };
}

/** A paused approval_gate step_run, with everything the approval handler needs. */
export interface PausedStepRun {
  id: string;
  status: StepRunStatus;
  position: number;
  step_type: string;
  workflow_run: {
    id: string;
    org_id: string;
    status: RunStatus;
    workflow: { id: string; name: string };
  };
  workflow_step: { name: string; config: Record<string, Json> };
}

export async function loadStepRunForDecision(
  stepRunId: string,
): Promise<PausedStepRun | null> {
  const data = await adminGraphql<{ step_runs_by_pk: PausedStepRun | null }>(
    `query LoadStepRunForDecision($id: uuid!) {
       step_runs_by_pk(id: $id) {
         id
         status
         position
         step_type
         workflow_run {
           id
           org_id
           status
           workflow { id name }
         }
         workflow_step { name config }
       }
     }`,
    { id: stepRunId },
  );
  return data.step_runs_by_pk;
}

/**
 * Records an approval. The `where` clause re-asserts that the step is still
 * paused, so two approvers racing on the same gate cannot both resume the run:
 * exactly one update affects a row, and the other is told the gate already moved.
 */
export async function recordApproval(params: {
  stepRunId: string;
  userId: string;
  note: string | null;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const data = await adminGraphql<{ update_step_runs: { affected_rows: number } }>(
    `mutation RecordApproval($id: uuid!, $set: step_runs_set_input!) {
       update_step_runs(
         where: { id: { _eq: $id }, status: { _eq: paused } }
         _set: $set
       ) { affected_rows }
     }`,
    {
      id: params.stepRunId,
      set: {
        status: 'completed',
        approved_by: params.userId,
        approved_at: now,
        decision_note: params.note,
        finished_at: now,
        output: { approved: true, approved_by: params.userId, approved_at: now, note: params.note },
      },
    },
  );
  return data.update_step_runs.affected_rows === 1;
}

export async function recordRejection(params: {
  stepRunId: string;
  userId: string;
  note: string | null;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const data = await adminGraphql<{ update_step_runs: { affected_rows: number } }>(
    `mutation RecordRejection($id: uuid!, $set: step_runs_set_input!) {
       update_step_runs(
         where: { id: { _eq: $id }, status: { _eq: paused } }
         _set: $set
       ) { affected_rows }
     }`,
    {
      id: params.stepRunId,
      set: {
        status: 'failed',
        rejected_by: params.userId,
        rejected_at: now,
        decision_note: params.note,
        finished_at: now,
        error: `Rejected by approver${params.note ? `: ${params.note}` : ''}`,
        output: { approved: false, rejected_by: params.userId, rejected_at: now, note: params.note },
      },
    },
  );
  return data.update_step_runs.affected_rows === 1;
}

export function stepByPosition(run: LoadedRun, position: number): LoadedStep | undefined {
  return run.step_runs.find((step) => step.position === position);
}
