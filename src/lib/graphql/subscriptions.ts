export const SUBSCRIBE_STEP_RUNS = `
  subscription SubscribeStepRuns($runId: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { step: { position: asc } }) {
      id
      status
      started_at
      completed_at
      input
      output
      error
      attempt_count
      step { id position type }
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
