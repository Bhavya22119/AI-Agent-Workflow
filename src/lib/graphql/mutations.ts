export const CREATE_WORKFLOW = `
  mutation CreateWorkflow($object: workflows_insert_input!) {
    insert_workflow_one(object: $object) { id }
  }
`;

export const UPDATE_WORKFLOW = `
  mutation UpdateWorkflow($id: uuid!, $name: String!, $description: String!) {
    update_workflow_by_pk(pk_columns: { id: $id }, _set: { name: $name, description: $description }) { id }
  }
`;

export const TRIGGER_WORKFLOW_RUN = `
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(workflowId: $workflowId) { runId status }
  }
`;

export const APPROVE_STEP = `
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(stepRunId: $stepRunId) { success }
  }
`;

export const DELETE_WORKFLOW = `
  mutation DeleteWorkflow($id: uuid!) {
    delete_workflow_by_pk(id: $id) { id }
  }
`;
