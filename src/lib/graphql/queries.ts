export const GET_WORKFLOWS = `
  query GetWorkflows($orgId: uuid!) {
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      name
      description
      steps_aggregate { aggregate { count } }
      triggers { type }
      latest_run: runs(order_by: { started_at: desc }, limit: 1) { status started_at }
    }
  }
`;

export const GET_WORKFLOW = `
  query GetWorkflow($id: uuid!) {
    workflow(id: $id) {
      id
      name
      description
      org_id
      steps(order_by: { position: asc }) { id position type config }
      triggers { id type config }
      runs(order_by: { started_at: desc }, limit: 5) { id status started_at completed_at }
    }
  }
`;

export const GET_ORG_USAGE = `
  query GetOrgUsage($orgId: uuid!) {
    organization(id: $orgId) {
      id
      name
      quota_limit
      quota_used
    }
  }
`;

export const GET_ORG_MEMBERS = `
  query GetOrgMembers($orgId: uuid!) {
    org_members(where: { org_id: { _eq: $orgId } }) {
      id
      role
      user { id displayName email }
    }
  }
`;
