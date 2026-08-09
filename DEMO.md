# Demo Walkthrough — Final Task Scenario

This document walks through the exact 6-point Final Task scenario that proves the system works end-to-end.

## Prerequisites

1. Nhost backend running (`nhost dev` or deployed to Nhost Cloud)
2. Frontend running (`npm run dev` or deployed to Vercel)
3. Seed data applied (two orgs, demo workflow)
4. At least 3 users created via signup:
   - **User A1** — owner of Org A
   - **User A2** — editor of Org A
   - **User B1** — owner of Org B

## Scenario Steps

### 1. Two Organizations Exist

After running the seed SQL:
- **Org A Demo** (ID: `11111111-1111-1111-1111-111111111111`) — quota: 100
- **Org B Demo** (ID: `22222222-2222-2222-2222-222222222222`) — quota: 50

After user signup, add members via Hasura Console or direct SQL:
```sql
-- Replace UUIDs with actual auth.users IDs from signup
INSERT INTO org_members (org_id, user_id, role) VALUES
('11111111-1111-1111-1111-111111111111', '<user-a1-id>', 'owner'),
('11111111-1111-1111-1111-111111111111', '<user-a2-id>', 'editor'),
('22222222-2222-2222-2222-222222222222', '<user-b1-id>', 'owner');
```

### 2. Build a Workflow in Org A (as Owner)

Log in as **User A1**, select **Org A Demo**.

The seed data already includes a 5-step workflow:
1. **llm_call** — "Analyze the sentiment of: {{input}}"
2. **http_request** — POST to httpbin.org with sentiment result
3. **conditional_branch** — if result contains "positive" → step 4, else → step 5
4. **approval_gate** — "Please review the positive sentiment result"
5. **db_write** — save sentiment_result to workflow_outputs

Triggers: Manual ✅ and Webhook ✅ (secret: `demo-webhook-secret-123`)

### 3. Start the Workflow Manually

1. Navigate to the demo workflow
2. Click **Run Workflow** button
3. The system creates a `workflow_run` and begins execution

### 4. Live Status Streams Step-by-Step

The Run Viewer page shows a GraphQL subscription on `step_runs`:

1. **Step 1 (llm_call)** — 🔵 Running → ✅ Completed
   - Output shows: LLM response (or stub: "[STUB] positive - The text has a generally positive sentiment...")
2. **Step 2 (http_request)** — 🔵 Running → ✅ Completed
   - Output shows: httpbin.org response with the sentiment data
3. **Step 3 (conditional_branch)** — 🔵 Running → ✅ Completed
   - Output shows: `{ "conditionMet": true }` (because stub output contains "positive")
4. **Step 4 (approval_gate)** — 🔵 Running → ⏸️ **Paused**
   - Banner: "⚠️ Paused — Awaiting Approval"
   - Approve button visible for owner/editor

**No page refresh needed** — updates stream via WebSocket subscription.

### 5. Approve the Paused Step

1. As **User A1** (owner) or **User A2** (editor), click **Approve**
2. The system:
   - Verifies the approver is owner/editor in the workflow's org (server-side)
   - Sets `approved_by` and `approved_at`
   - Marks step as completed
   - Resumes execution from step 5
3. **Step 5 (db_write)** — 🔵 Running → ✅ Completed
   - Output shows: `{ "success": true }`
4. Overall workflow run status: ✅ **Completed**

### 6. Start via Webhook Trigger

Use curl to invoke the webhook:

```bash
curl -X POST http://localhost:1337/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { invokeWorkflowWebhook(workflow_id: \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\", secret: \"demo-webhook-secret-123\", payload: {\"text\": \"This is wonderful news!\"}) { workflow_run_id status } }"
  }'
```

Response:
```json
{
  "data": {
    "invokeWorkflowWebhook": {
      "workflow_run_id": "<new-uuid>",
      "status": "pending"
    }
  }
}
```

The workflow starts executing, and the live subscription in the frontend updates.

### 7. Cross-Org Isolation Proof (as Org B User)

Log in as **User B1** (Org B owner).

**Attempt 1 — View Org A's workflows:**
- Navigate to dashboard → Only Org B workflows visible (none seeded)
- Org A's workflow does NOT appear in the list

**Attempt 2 — Direct ID query:**
```graphql
query {
  workflows_by_pk(id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") {
    id
    name
  }
}
```
Result: `null` (Hasura permission filter returns empty because User B1 has no membership in Org A)

**Attempt 3 — Trigger Org A's workflow:**
```graphql
mutation {
  triggerWorkflowRun(workflow_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") {
    workflow_run_id
    status
  }
}
```
Result: Error — "Insufficient permissions" (Action handler verifies org membership server-side)

**Attempt 4 — Approve Org A's paused step:**
```graphql
mutation {
  approveStep(step_run_id: "<org-a-paused-step-run-id>") {
    workflow_run_id
    status
  }
}
```
Result: Error — "Insufficient permissions" (Action handler verifies org membership server-side)

## What This Proves

All six points of the Final Task are satisfied:
1. ✅ Two separate organizations with their own users and roles
2. ✅ Owner builds a workflow with llm_call, http_request, conditional_branch, approval_gate, db_write
3. ✅ Workflow starts manually AND via webhook trigger
4. ✅ approval_gate pauses the run, only owner/editor can approve
5. ✅ Live status streams step-by-step with no refresh
6. ✅ Org B user cannot see, trigger, or approve Org A data — not even by guessing IDs

## Webhook Test Script

```bash
# Test webhook trigger
curl -X POST http://localhost:1337/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { invokeWorkflowWebhook(workflow_id: \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\", secret: \"demo-webhook-secret-123\", payload: {\"text\": \"I love this product!\"}) { workflow_run_id status } }"}'

# Test with wrong secret (should fail)
curl -X POST http://localhost:1337/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { invokeWorkflowWebhook(workflow_id: \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\", secret: \"wrong-secret\", payload: {}) { workflow_run_id status } }"}'
```
