export const CREATE_WORKFLOW = `
  mutation CreateWorkflow($orgId: uuid!, $name: String!, $desc: String, $steps: [workflow_steps_insert_input!]!) {
    insert_workflows_one(object: {
      org_id: $orgId,
      name: $name,
      description: $desc,
      workflow_steps: {
        data: $steps
      }
    }) {
      id
    }
  }
`;

export const UPDATE_WORKFLOW = `
  mutation UpdateWorkflow($id: uuid!, $name: String, $description: String) {
    update_workflows_by_pk(pk_columns: { id: $id }, _set: { name: $name, description: $description }) {
      id
      name
      description
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = `
  mutation TriggerWorkflowRun($id: uuid!) {
    triggerWorkflowRun(workflow_id: $id) {
      workflow_run_id
      status
    }
  }
`;

export const APPROVE_STEP = `
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(step_run_id: $stepRunId) {
      workflow_run_id
      status
    }
  }
`;

export const DELETE_WORKFLOW = `
  mutation DeleteWorkflow($id: uuid!) {
    delete_workflows_by_pk(id: $id) {
      id
    }
  }
`;
