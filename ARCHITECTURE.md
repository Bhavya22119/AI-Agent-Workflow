# Architecture — AI Agent Workflow Builder

## Schema Reasoning

The schema follows a hierarchical multi-tenancy model:

**Organization → Members → Workflows → Steps/Triggers → Runs → Step Runs**

- **organizations** — the top-level tenant boundary. Every resource is scoped to an org via direct or indirect FK. The `quota_allowed`/`quota_used` columns enable per-org rate limiting at the database level, with atomic increment via `_inc` mutations.

- **org_members** — the join table between auth.users and organizations. The `role` enum (`owner`/`editor`/`viewer`) drives both Hasura permission filters (Layer 1) and server-side action authorization (Layer 2). The `UNIQUE(org_id, user_id)` constraint prevents duplicate memberships.

- **workflows** — belong to one org. The `created_by` FK tracks provenance but is not used for access control (role-based, not creator-based).

- **workflow_steps** — ordered by `position` with a `UNIQUE(workflow_id, position)` constraint. The `type` enum ensures only valid step types exist. The `config` JSONB column stores type-specific configuration (prompt/model for llm_call, URL/method for http_request, etc.).

- **workflow_triggers** — one workflow can have multiple trigger types. The `webhook_secret` column stores the shared secret for webhook triggers. The `enabled` flag allows disabling triggers without deletion.

- **workflow_runs** — one per execution instance. The `status` enum includes `paused` to support approval gates. The `context` JSONB stores the initial trigger payload (webhook body, event data, etc.).

- **step_runs** — one per step per run. Mirrors the step position for ordering. Stores `input`/`output`/`error` per execution, plus `approved_by`/`approved_at` for approval gate tracking. The `attempt_count` tracks retries.

- **workflow_outputs** — normalized output storage for `db_write` steps. Also serves as the trigger table for `notify` steps via Hasura Event Triggers.

- **watched_records** — trigger table for `database_event` triggers. An insert here fires a Hasura Event Trigger that starts configured workflows.

### Aggregation View

`org_usage_summary` is a Postgres VIEW that computes:
- Quota remaining and usage percentage
- Total workflow and run counts per org
- Avoids expensive joins in real-time queries

## Relationship Design

All Hasura relationships follow foreign key constraints:
- Object relationships (many-to-one): `workflow.organization`, `step_run.workflow_run`, etc.
- Array relationships (one-to-many): `organization.workflows`, `workflow.workflow_steps`, etc.

This enables nested GraphQL queries like:
```graphql
query {
  workflows {
    name
    workflow_steps { position, type }
    workflow_runs(limit: 1, order_by: {started_at: desc}) {
      status
      step_runs { position, status }
    }
  }
}
```

## Layer 1: Hasura Org/Role Permissions

Every table's select/insert/update/delete permission uses an `_exists` check against `org_members`:

```yaml
filter:
  _exists:
    _table: { name: org_members, schema: public }
    _where:
      user_id: { _eq: X-Hasura-User-Id }
      org_id: { _eq: org_id }  # correlates to current row's org_id
      role: { _eq: owner }
```

**This means:**
1. A user can **only see data** in organizations where they have a membership
2. The role on that membership determines what operations they can perform
3. Guessing UUIDs is useless — the filter is applied at the database level
4. Even direct GraphQL queries with known IDs return empty results for unauthorized users

**Editor restrictions baked into permissions:**
- `workflow_steps` insert/update: `type: { _nin: ["db_write", "notify"] }`
- `workflow_triggers` insert: `type: { _nin: ["webhook"] }`
- `org_members` insert/update/delete: only `owner` role

## Layer 2: Action-Handler Step Gating

Hasura permissions control **which rows you can read/write**. But some operations need **business logic checks** that can't be expressed as row filters:

### triggerWorkflowRun
1. Extracts `user_id` from Hasura session headers (JWT-verified)
2. Looks up the workflow's `org_id` **from the database** (never trusts client input)
3. Queries `org_members` to verify the caller has `owner` or `editor` role
4. Checks `quota_used < quota_allowed` before allowing execution
5. Returns 403/429 with clear error messages on failure

### approveStep
1. Extracts `user_id` from session
2. Looks up the step_run → workflow_run → org_id chain **server-side**
3. Verifies `owner`/`editor` membership in that specific org
4. Checks the step is actually in `paused` status (prevents approval of non-paused steps)
5. Uses conditional update (`WHERE status = 'paused'`) to prevent double-approval race conditions

### invokeWorkflowWebhook
1. Does NOT require authentication headers
2. Looks up the workflow's webhook trigger configuration
3. Compares the provided secret against the stored `webhook_secret`
4. Verifies the trigger is `enabled`
5. Creates the run with the webhook payload in `context`

## Pause/Resume Design

The approval gate is the most complex flow:

```
Step 3 (conditional_branch) → completes
Step 4 (approval_gate) → executor sets:
  - step_run.status = 'paused'
  - workflow_run.status = 'paused'
  - executor RETURNS (stops execution loop)

[Time passes — subscription shows "Paused — Awaiting Approval"]

User calls approveStep(step_run_id):
  1. Verify permissions (owner/editor in same org)
  2. Conditional update: SET status='completed', approved_by, approved_at
     WHERE status='paused' (atomic guard against double-approval)
  3. If affected_rows = 0, return 409 (already approved)
  4. Call executeWorkflow(run_id, startPosition = step.position + 1)
  5. Executor resumes from step 5 onward
```

**Key design decisions:**
- The executor is a simple sequential loop that can be started at any position
- Resuming after approval reuses the same executor, just with a different start position
- Previous step outputs are fetched from the database when resuming
- The conditional update prevents race conditions without advisory locks

## Quota and Retry Handling

### Quota
- Checked **before** creating a run (fail fast)
- Incremented **after** successful completion via `_inc: { quota_used: 1 }` (atomic)
- Failed/paused runs do NOT consume quota (only completed runs count)
- The `org_usage_summary` view provides real-time quota visibility

### Retries
- `llm_call` and `http_request` steps retry once on failure
- Retry is triggered by: HTTP 5xx status codes, network errors, timeouts
- 1-second delay between attempts
- `attempt_count` is incremented on each attempt for visibility
- After 2 failed attempts, the step and run are marked as `failed`
- Non-retryable errors (4xx, validation) fail immediately
