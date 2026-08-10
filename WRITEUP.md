# Design Write-Up — AI Agent Workflow Builder

## Schema Reasoning

The schema is intentionally normalized around the organization boundary. Every data table carries an `org_id` foreign key (either directly or through a parent relationship), which creates a natural partition:

```
organizations
  └── org_members (user_id, role)
  └── workflows
        └── workflow_steps (position-ordered, typed via enum)
        └── workflow_triggers (manual, webhook, scheduled, database_event)
        └── workflow_runs (execution instance)
              └── step_runs (per-step status, input, output, error, attempt_count)
              └── workflow_outputs (db_write results)
  └── watched_records (database event trigger source)
```

**Why this shape:**
- **`org_members` as the gating table** — every permission check ultimately joins through `org_members` to verify the requesting user belongs to the target org with the correct role. This makes cross-org isolation a structural guarantee, not a convention.
- **`workflow_steps` with a `position` column** — steps execute in order. The `UNIQUE(workflow_id, position)` constraint prevents accidental duplicates.
- **`step_runs` separate from `workflow_steps`** — a step definition is reusable across runs. Each run creates its own `step_runs` snapshot, so historical runs are preserved even if the workflow definition changes later.
- **`workflow_outputs`** — a dedicated table for `db_write` results, scoped to org + run, so outputs are queryable and auditable.
- **PostgreSQL enums** (`org_role`, `step_type`, `trigger_type`, `run_status`, `step_run_status`) enforce valid values at the database level, not just the application layer.
- **`org_usage_summary` view** — a computed Postgres view that dynamically counts `workflow_runs` per org to calculate `quota_used`, `quota_remaining`, and `usage_percentage` in real-time without requiring manual counter maintenance.

---

## Two Permission Layers

### Layer 1 — Org + Role Scoping (Hasura Row-Level Permissions)

Every table in Hasura has row-level permissions that filter through `org_members`. For example, the `workflows` table select permission for role `user`:

```yaml
filter:
  organization:
    org_members:
      user_id:
        _eq: X-Hasura-User-Id
```

This means a GraphQL query for workflows will **only return rows belonging to organizations where the calling user is a member**. Even if a user guesses a workflow ID from another org, `workflows_by_pk(id: "...")` returns `null` because the row doesn't pass the filter.

Role-specific restrictions:
- **owner** — full CRUD on workflows, steps, triggers, runs, org members
- **editor** — can create/edit workflows and steps, can trigger runs, cannot manage org members
- **viewer** — read-only access, `insert`/`update`/`delete` permissions are not granted

These are enforced **in Hasura metadata**, not in application code — they apply to every GraphQL operation regardless of which client or endpoint is used.

### Layer 2 — Step-Level Gating (Action Handler Logic)

Some operations can't be expressed as simple row-level permissions:

1. **Step type restrictions** — Only an `owner` can add `db_write`, `notify`, or `webhook` trigger steps. This is enforced in the frontend workflow builder UI (the dropdown options are conditionally rendered based on role). The backend Action handler provides the enforcement backstop.

2. **Approval gate** — When a workflow reaches an `approval_gate` step, the executor sets `step_runs.status = 'paused'` and `workflow_runs.status = 'paused'`. The `approveStep` Action handler:
   - Looks up the paused step run and its parent workflow run
   - Extracts the `org_id` from the workflow run
   - Calls `verifyOrgMembership(userId, orgId, ['owner', 'editor'])` — a server-side check against `org_members`
   - Only if the check passes does it update the step to `completed` and resume execution
   - This is a **mid-execution decision** that cannot be a database permission because it requires business logic (checking the approver's role, setting `approved_by`/`approved_at`, then resuming the executor from the next step position)

3. **Quota enforcement** — The `triggerWorkflowRun` Action handler checks `checkQuota(orgId)` before creating a run. If `quota_used >= quota_allowed`, the run is rejected with HTTP 429. The quota is incremented on successful completion.

---

## Approval Gate Pause/Resume Implementation

The approval gate is implemented as a **cooperative pause between the executor and a separate Action handler**:

### Pause (in `_utils/executor.ts`)
```typescript
case 'approval_gate':
  await updateStepRunStatus(stepRun.id, 'paused', { input });
  await updateRunStatus(workflowRunId, 'paused');
  return; // ← exits the executor loop entirely
```

When the executor hits an `approval_gate` step, it:
1. Sets the step_run status to `paused`
2. Sets the overall workflow_run status to `paused`
3. **Returns immediately** — the executor function exits, freeing the serverless function

The run is now frozen in the database. The frontend subscription/polling picks up the `paused` state and shows the approval UI.

### Resume (in `approve-step.ts` Action handler)
When a user clicks "Approve":
1. The `approveStep` Action handler receives the `step_run_id`
2. It verifies the caller is `owner`/`editor` in the run's org (Layer 2 check)
3. It updates the step: `status = completed`, `approved_by = userId`, `approved_at = now()`
4. It calls `executeWorkflow(workflowRunId, stepRun.position + 1)` — this resumes the executor **from the next step position**, not from the beginning
5. The executor picks up where it left off and continues through remaining steps

This design means:
- No long-running processes — the executor runs only while there are steps to execute
- The pause state is durable in the database — even if the server restarts, the paused run is still there
- Resume is idempotent — calling approve on an already-approved step returns a 409 conflict
- Double-approval is prevented by the `where: { status: { _eq: paused } }` condition in the update mutation
