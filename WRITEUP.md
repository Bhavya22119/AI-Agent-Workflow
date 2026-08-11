# AI Agent Workflow Builder - Architecture Write-up

## 1. Schema Reasoning & Design

The database schema is designed to represent a scalable, multi-tenant workflow orchestration engine while ensuring strict data isolation at the organizational level.

### Core Tables
- **`organizations` & `org_members`**: The foundation of multi-tenancy. Everything belongs to an organization. `org_members` joins users to orgs with a specific `role` (`owner`, `editor`, `viewer`). 
- **`workflows`**: The top-level container, tied directly to an `org_id`.
- **`workflow_steps` & `workflow_triggers`**: Normalizing steps and triggers into separate tables enables flexible workflow configurations. Steps maintain an ordered `position` column. Triggers define how workflows start, keeping the engine decoupled from the invocation method (manual vs webhook vs cron).
- **`workflow_runs` & `step_runs`**: Represent execution history. A run tracks overall state (`pending`, `running`, `paused`, `completed`, `failed`), while `step_runs` track granular per-node execution details (inputs, outputs, errors, attempt counts, and approval metadata). 

### Aggregation View
We use a Postgres View `org_usage_summary` (which joins `organizations` with `workflow_runs`) to track and compute organization-level usage dynamically, calculating total runs and average run duration without requiring manual triggers or complex computed fields.

---

## 2. The Two Permission Layers

Data security in a multi-tenant workflow engine requires more than just database row-level security. We implemented a two-layered permission model:

### Layer 1: Row-Level Scoping (Database/Hasura Level)
Layer 1 ensures that a user can *never* see or interact with data outside their organization, regardless of their role. This is enforced directly in Hasura's GraphQL Engine using session variables (`X-Hasura-User-Id`). 
- When an API requests `workflows`, Hasura intercepts the query and applies a boolean expression: `workflow.org_id` must match an `org_id` where the user exists in the `org_members` table.
- This creates airtight cross-org isolation. Even if a user guesses a valid workflow ID from another org, Hasura returns an empty set.

### Layer 2: Step-Level Gating (API/Execution Level)
Role-based constraints (who can add specific steps or approve runs) are mid-execution and structural decisions that cannot be easily solved by row-level read/write rules. Layer 2 is enforced in our Next.js API Routes (which act as secure custom Action handlers):
- **Save-Time Gating:** When saving a workflow (`/api/save-workflow`), the handler queries the user's role. If an `editor` attempts to add a `db_write`, `notify`, or `webhook` trigger, the API rejects the request with a `403 Forbidden` response. Only `owner` roles can commit these restricted nodes.
- **Run-Time Gating:** During execution, a viewer can view a workflow's progress via GraphQL subscriptions, but the backend prevents them from manually triggering it (`/api/run-workflow`) or approving it (`/api/approve-step`).

---

## 3. Approval Gate: Pause & Resume Implementation

The `approval_gate` step allows workflows to pause execution, requiring human intervention. Implementing this requires coordination between the execution engine, the database, and the frontend.

### Pausing the Execution
When the orchestration engine (`executor.ts`) encounters an `approval_gate` node:
1. It updates the `step_runs` table, changing the status to `paused`.
2. It changes the parent `workflow_runs` status to `paused`.
3. The engine **terminates** its current serverless function execution. It does not await a response or keep the function alive, preventing timeouts and saving compute resources.

### Resuming the Execution
When a user clicks "Approve" in the frontend:
1. The frontend calls the `/api/approve-step` API route.
2. The route verifies the user's role. It queries `org_members` to ensure the user is an `owner` or `editor` in that specific organization.
3. If authorized, the route updates the `step_runs` record to `completed`, recording the user's ID in `approved_by` and the current timestamp in `approved_at`.
4. It updates the `workflow_runs` status back to `running`.
5. Finally, the route calls the `waitUntil(executeWorkflow(...))` engine function asynchronously. The engine wakes up, queries the database for the next pending step, and resumes execution seamlessly from where it left off.
