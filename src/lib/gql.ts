/**
 * Every GraphQL document the client sends.
 *
 * Note what is NOT here: no query filters on org_id for security purposes. The
 * `where: { org_id: ... }` clauses below exist so the UI shows the organization
 * you have selected — they are not what stops you reading another tenant's data.
 * That is done by Hasura's row-level permissions, which apply the org_members
 * predicate to every one of these documents regardless of what the client asks
 * for. Deleting every filter here would change what is displayed, not what is
 * accessible.
 */

/* ------------------------------------------------------------------ identity */

export const MY_MEMBERSHIPS = /* GraphQL */ `
  query MyMemberships {
    org_members(order_by: { created_at: asc }) {
      id
      org_id
      user_id
      role
      created_at
      organization {
        id
        name
        slug
        quota_limit
        quota_used
        quota_period_start
      }
    }
  }
`;

/* ---------------------------------------------------------------- dashboard */

/**
 * The assignment's required query: an org's workflows with their steps, their
 * triggers, and the status of the most recent run.
 */
export const ORG_WORKFLOWS = /* GraphQL */ `
  query OrgWorkflows($orgId: uuid!) {
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { updated_at: desc }) {
      id
      org_id
      name
      description
      is_active
      created_at
      updated_at
      workflow_steps(order_by: { position: asc }) {
        id
        position
        key
        type
        name
        config
        next
        canvas_x
        canvas_y
        retry_limit
        timeout_ms
      }
      workflow_triggers(order_by: { created_at: asc }) {
        id
        type
        config
        cron_expression
        is_enabled
        last_fired_at
      }
      workflow_runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        trigger_type
        started_at
        finished_at
        error
      }
    }
    org_usage_summary(where: { org_id: { _eq: $orgId } }) {
      org_id
      org_name
      quota_limit
      quota_used
      quota_remaining
      quota_used_pct
      period_start
      period_end
      runs_this_period
      runs_completed
      runs_failed
      runs_active
      runs_total
      avg_run_duration_ms
      workflow_count
    }
  }
`;

export const ORG_USAGE = /* GraphQL */ `
  query OrgUsage($orgId: uuid!) {
    org_usage_summary(where: { org_id: { _eq: $orgId } }) {
      org_id
      org_name
      quota_limit
      quota_used
      quota_remaining
      quota_used_pct
      period_start
      period_end
      runs_this_period
      runs_completed
      runs_failed
      runs_active
      runs_total
      avg_run_duration_ms
      workflow_count
    }
  }
`;

export const RECENT_RUNS = /* GraphQL */ `
  query RecentRuns($orgId: uuid!, $limit: Int! = 12) {
    workflow_runs(
      where: { org_id: { _eq: $orgId } }
      order_by: { started_at: desc }
      limit: $limit
    ) {
      id
      status
      trigger_type
      started_at
      finished_at
      error
      workflow {
        id
        name
      }
      step_runs_aggregate(where: { status: { _eq: paused } }) {
        aggregate {
          count
        }
      }
    }
  }
`;

/* ----------------------------------------------------------------- workflow */

export const WORKFLOW_DETAIL = /* GraphQL */ `
  query WorkflowDetail($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      org_id
      name
      description
      is_active
      created_at
      updated_at
      workflow_steps(order_by: { position: asc }) {
        id
        workflow_id
        position
        key
        type
        name
        config
        next
        canvas_x
        canvas_y
        retry_limit
        timeout_ms
      }
      workflow_triggers(order_by: { created_at: asc }) {
        id
        workflow_id
        type
        config
        cron_expression
        is_enabled
        last_fired_at
      }
      workflow_runs(order_by: { started_at: desc }, limit: 10) {
        id
        status
        trigger_type
        started_at
        finished_at
        error
      }
    }
  }
`;

/**
 * Creates a workflow together with a manual trigger, in one nested insert (so it
 * is one transaction). A brand-new workflow is therefore immediately runnable
 * rather than presenting an empty canvas with a Run button that cannot work.
 */
export const CREATE_WORKFLOW = /* GraphQL */ `
  mutation CreateWorkflow($object: workflows_insert_input!) {
    insert_workflows_one(object: $object) {
      id
      name
    }
  }
`;

/**
 * Saves a workflow's steps and triggers.
 *
 * Steps are replaced wholesale (delete + insert) rather than diffed: positions
 * are unique per workflow, so an in-place reorder would collide midway through.
 * Hasura runs all of these in one transaction, so a rejected insert — an editor
 * trying to add a db_write step, say — rolls back the deletes too and the saved
 * workflow is left exactly as it was.
 */
export const SAVE_WORKFLOW_GRAPH = /* GraphQL */ `
  mutation SaveWorkflowGraph(
    $workflowId: uuid!
    $name: String!
    $description: String
    $isActive: Boolean!
    $steps: [workflow_steps_insert_input!]!
    $triggers: [workflow_triggers_insert_input!]!
    $keepTriggerIds: [uuid!]!
  ) {
    update_workflows_by_pk(
      pk_columns: { id: $workflowId }
      _set: { name: $name, description: $description, is_active: $isActive }
    ) {
      id
    }
    delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
    delete_workflow_triggers(
      where: { workflow_id: { _eq: $workflowId }, id: { _nin: $keepTriggerIds } }
    ) {
      affected_rows
    }
    insert_workflow_steps(objects: $steps) {
      affected_rows
    }
    insert_workflow_triggers(objects: $triggers) {
      affected_rows
    }
  }
`;

export const UPDATE_TRIGGER = /* GraphQL */ `
  mutation UpdateTrigger($id: uuid!, $set: workflow_triggers_set_input!) {
    update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
      is_enabled
      cron_expression
      config
    }
  }
`;

export const DELETE_WORKFLOW = /* GraphQL */ `
  mutation DeleteWorkflow($id: uuid!) {
    delete_workflows_by_pk(id: $id) {
      id
    }
  }
`;

/* ---------------------------------------------------------------------- runs */

export const RUN_DETAIL = /* GraphQL */ `
  query RunDetail($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      id
      workflow_id
      org_id
      status
      trigger_type
      trigger_payload
      triggered_by
      started_at
      finished_at
      error
      workflow {
        id
        name
      }
      workflow_outputs(order_by: { created_at: asc }) {
        id
        key
        value
        created_at
      }
      notifications(order_by: { created_at: asc }) {
        id
        channel
        target
        subject
        body
        status
        error
        created_at
        sent_at
      }
    }
  }
`;

/**
 * The required subscription: live per-step progress for one run, including the
 * "paused, awaiting approval" state and the approver once a gate is cleared.
 */
export const STEP_RUNS_SUBSCRIPTION = /* GraphQL */ `
  subscription StepRuns($runId: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { position: asc }) {
      id
      workflow_run_id
      workflow_step_id
      position
      step_type
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      rejected_by
      rejected_at
      decision_note
      started_at
      finished_at
      workflow_step {
        name
        type
        config
      }
      approver {
        id
        displayName
        email
      }
    }
  }
`;

export const RUN_STATUS_SUBSCRIPTION = /* GraphQL */ `
  subscription RunStatus($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      error
      started_at
      finished_at
    }
  }
`;

/** One workflow's executions, live — powers the editor's history panel. */
export const WORKFLOW_RUNS_SUBSCRIPTION = /* GraphQL */ `
  subscription WorkflowRuns($workflowId: uuid!, $limit: Int! = 20) {
    workflow_runs(
      where: { workflow_id: { _eq: $workflowId } }
      order_by: { started_at: desc }
      limit: $limit
    ) {
      id
      status
      trigger_type
      started_at
      finished_at
      error
    }
  }
`;

/** Org-wide live feed, so the dashboard reflects webhook/scheduled runs too. */
export const ORG_RUNS_SUBSCRIPTION = /* GraphQL */ `
  subscription OrgRuns($orgId: uuid!, $limit: Int! = 12) {
    workflow_runs(
      where: { org_id: { _eq: $orgId } }
      order_by: { started_at: desc }
      limit: $limit
    ) {
      id
      status
      trigger_type
      started_at
      finished_at
      error
      workflow {
        id
        name
      }
    }
  }
`;

/* ------------------------------------------------------------------- members */

export const ORG_MEMBERS = /* GraphQL */ `
  query OrgMembers($orgId: uuid!) {
    org_members(where: { org_id: { _eq: $orgId } }, order_by: { created_at: asc }) {
      id
      org_id
      user_id
      role
      created_at
      user {
        id
        displayName
        email
      }
    }
  }
`;

export const UPDATE_MEMBER_ROLE = /* GraphQL */ `
  mutation UpdateMemberRole($id: uuid!, $role: org_role!) {
    update_org_members_by_pk(pk_columns: { id: $id }, _set: { role: $role }) {
      id
      role
    }
  }
`;

export const REMOVE_MEMBER = /* GraphQL */ `
  mutation RemoveMember($id: uuid!) {
    delete_org_members_by_pk(id: $id) {
      id
    }
  }
`;

export const RENAME_ORG = /* GraphQL */ `
  mutation RenameOrg($id: uuid!, $name: String!) {
    update_organizations_by_pk(pk_columns: { id: $id }, _set: { name: $name }) {
      id
      name
    }
  }
`;

/* ------------------------------------------------------- database event demo */

export const INSERT_WATCHED_RECORD = /* GraphQL */ `
  mutation InsertWatchedRecord($object: watched_records_insert_input!) {
    insert_watched_records_one(object: $object) {
      id
      source_key
      created_at
    }
  }
`;

export const WATCHED_RECORDS = /* GraphQL */ `
  query WatchedRecords($orgId: uuid!, $limit: Int! = 5) {
    watched_records(
      where: { org_id: { _eq: $orgId } }
      order_by: { created_at: desc }
      limit: $limit
    ) {
      id
      source_key
      payload
      created_at
    }
  }
`;

/* --------------------------------------------------------- LLM connections */

/**
 * `api_key` is not requested here because it cannot be: the column is absent from
 * the select permission, so asking for it is a schema error rather than a leak.
 */
export const LLM_CONNECTIONS = /* GraphQL */ `
  query LlmConnections($orgId: uuid!) {
    llm_connections(where: { org_id: { _eq: $orgId } }, order_by: { name: asc }) {
      id
      org_id
      name
      provider
      protocol
      base_url
      default_model
      created_at
      updated_at
    }
  }
`;

export const INSERT_LLM_CONNECTION = /* GraphQL */ `
  mutation InsertLlmConnection($object: llm_connections_insert_input!) {
    insert_llm_connections_one(object: $object) {
      id
      name
      provider
      protocol
      base_url
      default_model
    }
  }
`;

/**
 * `_set` is built by the caller so that leaving the API key field blank omits the
 * column entirely — editing a connection's model should not require re-typing the
 * key, and there is no way to read the old value back to re-send it.
 */
export const UPDATE_LLM_CONNECTION = /* GraphQL */ `
  mutation UpdateLlmConnection($id: uuid!, $set: llm_connections_set_input!) {
    update_llm_connections_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
      name
      provider
      protocol
      base_url
      default_model
    }
  }
`;

export const DELETE_LLM_CONNECTION = /* GraphQL */ `
  mutation DeleteLlmConnection($id: uuid!) {
    delete_llm_connections_by_pk(id: $id) {
      id
    }
  }
`;
