export const GET_WORKFLOWS = `
  query GetWorkflows($orgId: uuid!) {
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      name
      description
      created_at
      updated_at
      workflow_steps_aggregate {
        aggregate {
          count
        }
      }
      workflow_runs(limit: 1, order_by: { started_at: desc }) {
        status
        started_at
      }
    }
  }
`;

export const GET_WORKFLOW = `
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      created_at
      updated_at
      workflow_steps(order_by: { position: asc }) {
        id
        position
        type
        config
      }
      workflow_triggers {
        id
        type
        enabled
        webhook_secret
      }
      workflow_runs(order_by: { started_at: desc }, limit: 10) {
        id
        status
        started_at
        completed_at
      }
    }
  }
`;

export const GET_ORG_USAGE = `
  query GetOrgUsage($orgId: uuid!) {
    org_usage_summary(where: { org_id: { _eq: $orgId } }) {
      org_id
      name
      quota_allowed
      quota_used
      quota_remaining
      usage_percentage
      total_runs
      total_workflows
    }
  }
`;

export const GET_ORG_MEMBERS = `
  query GetOrgMembers($orgId: uuid!) {
    org_members(where: { org_id: { _eq: $orgId } }) {
      id
      user_id
      role
      created_at
    }
  }
`;

export const GET_RUN_DATA = `
  query GetRunData($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      started_at
      completed_at
    }
    step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { position: asc }) {
      id
      position
      status
      input
      output
      error
      attempt_count
      started_at
      completed_at
      workflow_step {
        type
        config
      }
    }
  }
`;
