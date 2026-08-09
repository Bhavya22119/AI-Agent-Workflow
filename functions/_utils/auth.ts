import { adminQuery } from './graphql';

export function getUserIdFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const val = headers['x-hasura-user-id'];
  return Array.isArray(val) ? val[0] : (val || null);
}

export async function verifyOrgMembership(
  userId: string,
  orgId: string,
  requiredRoles: string[] = ['owner', 'editor']
): Promise<{ role: string } | null> {
  const data = await adminQuery(`
    query VerifyMembership($userId: uuid!, $orgId: uuid!, $roles: [org_role!]!) {
      org_members(where: {
        user_id: { _eq: $userId },
        org_id: { _eq: $orgId },
        role: { _in: $roles }
      }) {
        id
        role
      }
    }
  `, { userId, orgId, roles: requiredRoles });
  
  if (!data.org_members || data.org_members.length === 0) return null;
  return { role: data.org_members[0].role };
}

export async function getOrgIdFromWorkflow(workflowId: string): Promise<string | null> {
  const data = await adminQuery(`
    query GetOrgId($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) {
        org_id
      }
    }
  `, { workflowId });
  return data.workflows_by_pk?.org_id || null;
}

export async function getOrgIdFromWorkflowRun(runId: string): Promise<{ orgId: string; workflowId: string } | null> {
  const data = await adminQuery(`
    query GetRunOrg($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        org_id
        workflow_id
      }
    }
  `, { runId });
  if (!data.workflow_runs_by_pk) return null;
  return { orgId: data.workflow_runs_by_pk.org_id, workflowId: data.workflow_runs_by_pk.workflow_id };
}

export async function checkQuota(orgId: string): Promise<boolean> {
  const data = await adminQuery(`
    query CheckQuota($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        quota_allowed
        quota_used
      }
    }
  `, { orgId });
  const org = data.organizations_by_pk;
  if (!org) return false;
  return org.quota_used < org.quota_allowed;
}
