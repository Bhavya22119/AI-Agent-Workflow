# AI Agent Workflow Builder

A production-quality workflow orchestration engine designed to chain AI agents and HTTP requests across isolated organizations. Built on Next.js, Nhost, Hasura, and PostgreSQL.

## Live Demo

🔗 **Deployed App**: [https://ai-agent-workflow-vpjc.vercel.app](https://ai-agent-workflow-vpjc.vercel.app)

## Features

- **Multi-Tenant Org Isolation:** Everything is strictly gated by `org_id` + `org_members`. Even known workflow IDs return empty sets for cross-org users.
- **6 Step Types:** `llm_call`, `http_request`, `db_write`, `notify`, `conditional_branch`, and `approval_gate`.
- **4 Trigger Types:** Manual, Webhook (with shared secret), Scheduled (cron), and Database Event.
- **Two Permission Layers:**
  - Layer 1: Hasura row-level permissions scoped via org membership
  - Layer 2: Action handler logic for step-level gating (approval_gate, quota check)
- **Real-Time Run Viewer:** Live step-by-step progress with polling-based updates.
- **Approval Gates:** Mid-run pauses with role-verified resume (only owner/editor can approve).
- **Conditional Branching:** Steps can skip ahead based on previous step output evaluation.
- **Quotas & Retries:** Organization-level limits with automatic enforcement. LLM and HTTP steps retry once on transient failure.
- **LLM Integration:** Groq API (llama3-8b-8192) with deterministic stub fallback.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Backend | Nhost Cloud (Postgres, Hasura, Auth, Functions) |
| Database | PostgreSQL with enums, views, indexes |
| GraphQL | Hasura GraphQL Engine with permissions |
| Auth | Nhost Auth (email+password) |
| LLM | Groq API (free tier) with stub fallback |
| Serverless | Nhost Functions (Express handlers) |

## Running Locally

### Prerequisites
- Node.js 18+
- npm

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Bhavya22119/AI-Agent-Workflow.git
   cd AI-Agent-Workflow
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Create `.env.local` with:
   ```env
   NEXT_PUBLIC_NHOST_SUBDOMAIN=osouykwsxrtvrkapwnwp
   NEXT_PUBLIC_NHOST_REGION=ap-south-1
   ```
   
   Optional — for real LLM calls instead of stubs:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. **Start the dev server:**
   ```bash
   npm run dev
   ```

5. **Open browser:**
   Navigate to `http://localhost:3000`

### Seed Data

The database on Nhost Cloud already has seed data:
- **Org A Demo** (quota: 100) — with a 5-step demo workflow
- **Org B Demo** (quota: 100) — empty, for cross-org isolation testing
- Three users mapped to orgs with owner/editor roles

## Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (dashboard)/        # Protected dashboard routes
│   │   │   ├── dashboard/      # Overview page
│   │   │   ├── settings/       # Org settings + members
│   │   │   ├── workflows/      # Workflow list, builder, detail
│   │   │   │   ├── new/        # Workflow builder (add/reorder steps, attach triggers)
│   │   │   │   ├── [id]/       # Workflow detail + run button
│   │   │   │   └── [id]/runs/[runId]/ # Live run viewer
│   │   │   └── layout.tsx      # Dashboard sidebar layout
│   │   ├── login/              # Auth login page
│   │   ├── signup/             # Auth signup page
│   │   └── layout.tsx          # Root layout with NhostProvider
│   ├── components/ui/          # Reusable UI components
│   ├── hooks/                  # useGraphQL, useOrg
│   └── lib/                    # nhost client, types
├── functions/                  # Nhost serverless functions
│   ├── trigger-workflow-run.ts # Hasura Action handler
│   ├── approve-step.ts         # Hasura Action handler
│   ├── invoke-workflow-webhook.ts # Webhook trigger handler
│   ├── scheduled-trigger.ts    # Cron trigger handler
│   ├── handle-watched-record.ts # Database event handler
│   ├── handle-notify.ts        # Notify event trigger
│   └── _utils/                 # Shared utilities
│       ├── executor.ts         # Step execution engine with retry
│       ├── graphql.ts          # Admin GraphQL client
│       ├── auth.ts             # Org membership verification
│       └── llm.ts              # Groq/stub LLM client
├── nhost/
│   ├── migrations/             # PostgreSQL schema
│   └── metadata/               # Hasura tracking, permissions, relationships
├── WRITEUP.md                  # Schema reasoning & permission design
├── DEMO.md                     # End-to-end demo walkthrough
└── README.md
```

## Documentation

- **[WRITEUP.md](./WRITEUP.md)** — Schema reasoning, two permission layers, approval-gate implementation
- **[DEMO.md](./DEMO.md)** — Step-by-step final task scenario walkthrough

## API Keys

- LLM calls use the **Groq free tier** (llama3-8b-8192). If `GROQ_API_KEY` is not set, a deterministic stub with artificial delay is used instead. The stub is clearly marked in output as `[STUB]`.
