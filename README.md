# AI Agent Workflow Builder

A production-quality workflow orchestration engine designed to chain AI agents and HTTP requests across isolated organizations. Built on Next.js, Nhost, Hasura, and PostgreSQL.

## Features
- **Multi-Tenant Org Isolation:** Everything is strictly gated by `org_id` and `org_members`. Even known workflow IDs return empty sets for unauthenticated or cross-org users.
- **Real-Time Run Viewer:** Users can watch step-by-step executions via Hasura GraphQL subscriptions as Serverless Functions execute logic in the background.
- **6 Step Types:** `llm_call`, `http_request`, `db_write`, `notify`, `conditional_branch`, and `approval_gate`.
- **Dynamic Branching & Approval Gates:** Support for mid-run pauses and role-based continuation (preventing double approvals with conditional updates).
- **Triggers:** Manual executions and webhook invocations using shared secrets.
- **Quotas & Retries:** Organization-level limits dynamically lock execution when exhausted. Transient failures automatically retry before failing permanently.

## Technical Architecture
Please see [ARCHITECTURE.md](./ARCHITECTURE.md) for a deep dive into the schema layout, Hasura metadata patterns, and backend executor logic.

## Running Locally

1. **Start Nhost:**
   ```bash
   nhost dev
   ```
2. **Apply Migrations and Seed Data:**
   *(Nhost dev usually auto-applies everything in `nhost/migrations` and `nhost/metadata`. If not, run `nhost dev` and push it through the CLI).*
3. **Environment Variables:**
   Copy `.env.example` to `.env.local` and add your GROQ API key if you want real LLM calls instead of deterministic stubs:
   ```bash
   cp .env.example .env.local
   ```
4. **Start the Frontend & Functions:**
   ```bash
   npm run dev
   # Functions run automatically on port 3000 in Nhost, but you can also run them locally if testing standalone.
   ```

## Demo Scenario
Please see [DEMO.md](./DEMO.md) for a step-by-step walk-through of the end-to-end final task scenario validating cross-org constraints, triggers, and the approval gate.
