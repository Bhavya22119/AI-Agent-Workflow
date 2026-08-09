export const SUBSCRIBE_STEP_RUNS = `
  subscription SubscribeStepRuns($runId: uuid!) {
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
        id
        position
        type
        config
      }
    }
  }
`;

export const SUBSCRIBE_WORKFLOW_RUN = `
  subscription SubscribeWorkflowRun($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      started_at
      completed_at
    }
  }
`;
