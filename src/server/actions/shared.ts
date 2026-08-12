import { ActionError } from '../auth';
import { adminGraphql } from '../hasura';

/**
 * "Not found" and "belongs to another organization" deliberately produce the
 * same error, so these endpoints cannot be used to discover whether a UUID
 * exists in some other tenant.
 */
export const OPAQUE_NOT_FOUND = 'Not found, or you do not have access to it.';

export interface WorkflowRef {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
}

export async function loadWorkflow(workflowId: string): Promise<WorkflowRef> {
  const data = await adminGraphql<{ workflows_by_pk: WorkflowRef | null }>(
    `query LoadWorkflow($id: uuid!) {
       workflows_by_pk(id: $id) { id org_id name is_active }
     }`,
    { id: workflowId },
  );
  if (!data.workflows_by_pk) {
    throw new ActionError('NOT_FOUND', OPAQUE_NOT_FOUND, 404);
  }
  return data.workflows_by_pk;
}

export async function countStepRuns(runId: string): Promise<number> {
  const data = await adminGraphql<{
    step_runs_aggregate: { aggregate: { count: number } | null };
  }>(
    `query CountStepRuns($runId: uuid!) {
       step_runs_aggregate(where: { workflow_run_id: { _eq: $runId } }) {
         aggregate { count }
       }
     }`,
    { runId },
  );
  return data.step_runs_aggregate.aggregate?.count ?? 0;
}

/** Requires a well-formed UUID before it is used in a query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ActionError('BAD_REQUEST', `${field} must be a UUID.`, 400);
  }
  return value;
}

export function optionalString(value: unknown, max = 2000): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}
