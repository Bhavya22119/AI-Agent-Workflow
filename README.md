# Agent Flow

A multi-tenant AI agent workflow builder — a focused n8n for chaining LLM steps —
built on **Nhost (PostgreSQL + Hasura + Auth)** and **Next.js**.

Users inside an organization compose workflows on a node canvas, start them four
different ways, and every action is checked against two independent permission
layers.

---

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Two transports](#two-transports)
- [Demo accounts](#demo-accounts)
- [Walkthrough](#walkthrough)
- [Testing](#testing)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Repository layout](#repository-layout)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## What it does

**Six node types**

| Node | Behaviour |
| --- | --- |
| `llm_call` | Calls a real language model — the deployment's provider, or one of the organization's own endpoints |
| `http_request` | Calls any external API, with retries, a timeout and an SSRF guard |
| `conditional_branch` | Two outputs — `true` and `false` — wired to different nodes |
| `approval_gate` | Pauses the run until someone with the right role approves |
| `db_write` | Saves a result into the app's own `workflow_outputs` table |
| `notify` | Queues a Slack/email alert, delivered by a Hasura Event Trigger |

**Four ways to start a run**

| Trigger | Behaviour |
| --- | --- |
| Manual | An owner or editor presses Run, with an editable payload |
| Webhook | A live HTTP endpoint an external system calls with a secret |
| Scheduled | A cron expression, evaluated every minute by a Hasura Cron Trigger |
| Database event | A row in a watched table starts the run automatically |

**Every webhook is configured on its own**

Two webhook triggers on one workflow are two endpoints, and the systems calling
them are rarely alike. Each one sets:

| Setting | Options | Enforced by |
| --- | --- | --- |
| Name | Free text, shown on the canvas and in run history | — |
| Method | `POST` `GET` `PUT` `PATCH` — anything else gets 405 naming the right verb | the endpoint |
| Secret goes in | `x-webhook-secret` header, `?secret=` query, or `Authorization: Bearer` | the endpoint |
| Respond | `202` immediately with the run id, or wait and return the run's status, final output and saved rows | the endpoint |
| Required fields | Payload keys that must be present, else `400` and **no run is created** | the endpoint |

The panel also shows the callable URL, reveals and rotates the secret, and gives a
curl that matches how that trigger is actually configured. A GET webhook's query
string becomes the run payload; the secret is stripped out of it either way.

**Bring your own model**

An `llm_call` node can use the deployment's provider or one of its organization's
`llm_connections`: a provider (OpenAI, Anthropic, Gemini, Groq, OpenRouter,
Mistral, DeepSeek, Together, Fireworks, Cerebras, xAI, Perplexity, Ollama, LM
Studio, vLLM, llama.cpp, or anything else), a base URL, an API key and a default
model. Picking a provider fills in the rest; **Test connection** sends one real
completion before you save.

Three wire protocols cover all of them — `/chat/completions`, `/v1/messages` and
`:generateContent` — so adding a vendor is a row in a list, not a code change.

The API key lives in `llm_connections.api_key`, which appears in **no select
permission for any role**. It goes in and never comes back out: only the engine
reads it, with the admin secret. A custom base URL goes through the same SSRF
guard as `http_request`, so a "connection" cannot be pointed at cloud instance
metadata.

**Plus**

- A full-screen node canvas: drag nodes, drag connections between outputs and
  inputs, configure each node in a side panel
- Live execution in the editor — per-node status and timing over a GraphQL
  subscription, including the paused-awaiting-approval state
- Execution history per workflow
- Pre-run validation that flags unconfigured nodes and dangling connections before
  anything executes
- Per-organization usage quota, enforced transactionally
- 156 automated checks against the live backend

---

## Quick start

Requires **Node 20.9+** and an Nhost project (the free tier is enough). No Docker
and no Hasura CLI — the setup scripts talk to Hasura's HTTP APIs directly.

```bash
npm install
cp .env.example .env.local      # subdomain, region, admin secret, LLM key
npm run setup                   # schema + Hasura metadata + demo data
npm run dev                     # http://localhost:3000
```

`npm run setup` sequences three idempotent steps you can also run individually:

| Command | What it does |
| --- | --- |
| `npm run db:apply` | Applies pending migrations, tracked in `public.schema_migrations` |
| `npm run db:reset` | Drops this app's objects in `public`, then re-applies every migration. The Nhost-managed `auth`/`storage` schemas — and every user account — are untouched |
| `npm run hasura:apply` | Tracks tables, relationships, both permission layers, 7 Actions, 2 Event Triggers and 1 Cron Trigger. Generates missing shared secrets into `.env.local` |
| `npm run seed` | Creates two organizations, four users with different roles, and a demo workflow. Prints credentials and a ready-to-paste `curl` |
| `npm run verify` | 75 checks: cross-org isolation, both permission layers, engine, triggers, quota, retry |
| `npm run test:nodes` | 58 checks: every node type, every branch operator, and the failure paths |

---

## Two transports

Worth understanding before running anything.

Hasura runs in Nhost's cloud, so **Hasura calls the Action handlers over the public
internet**. It cannot reach `http://localhost:3000`. That is a networking fact, and
it has one consequence:

| `NEXT_PUBLIC_ACTION_TRANSPORT` | Path | Use when |
| --- | --- | --- |
| `hasura` (default) | browser → GraphQL mutation → Hasura → handler | `APP_BASE_URL` is public (a deployment, or a tunnel) |
| `direct` | browser → handler route with its JWT | developing locally, before deploying |

Both transports reach the **same handler with the same authorization**. Only the
proof of identity differs:

- `hasura` — the request carries `x-hasura-action-secret`, proving it came from the
  project's Hasura instance, which has already validated the JWT. The identity in
  `session_variables` is therefore trusted.
- `direct` — the request carries `Authorization: Bearer <jwt>`, verified against
  Nhost Auth. `session_variables` in the body is ignored entirely.

Neither path reads the caller's identity from the request body. `npm run verify`
asserts that a forged `session_variables` body without the action secret is rejected
with 401, and that a wrong secret is rejected rather than falling back.

After deploying: set `APP_BASE_URL` to the deployment URL, re-run
`npm run hasura:apply`, and remove `NEXT_PUBLIC_ACTION_TRANSPORT`.

---

## Demo accounts

`npm run seed` prints these. Password for all of them: **`Password123!`**

| Organization | Email | Role | Can |
| --- | --- | --- | --- |
| A — Northwind Support | `owner-a@agentflow.test` | owner | Everything, including `db_write` / `notify` nodes and webhook triggers |
| A — Northwind Support | `editor-a@agentflow.test` | editor | Build and run workflows, approve gates — not the owner-only node types |
| A — Northwind Support | `viewer-a@agentflow.test` | viewer | Read only; cannot run or approve |
| B — Contoso Logistics | `owner-b@agentflow.test` | owner | Only Org B, and nothing of Org A's |

The Nhost project requires email verification, so the seed script creates each
account through the real sign-up endpoint, marks it verified with the admin secret,
and signs in as each one to prove the credentials work before printing them.

### The seeded workflow — "Support ticket triage" (Org A)

```
manual   ┐
webhook  ┼─► classify ──► log to API ──► route ──true──► approval ──► notify ─┐
db event ┤   (llm_call)     (http)      (condition)       (gate)              ├──► save
schedule ┘                                  └──────────false────────────────────┘  (db_write)
```

The condition reads the **LLM's** answer (`{{steps.1.output.text}}`), not the HTTP
response, so the model's output genuinely changes what runs next.

---

## Walkthrough

A full recording script is in [DEMO.md](./DEMO.md). In short:

1. **Two organizations** — sign in as `owner-a`, and as `owner-b` in another browser
   profile. Each sees only their own organization.
2. **Open the canvas** — *Open editor* on *Support ticket triage* opens it
   full-screen in a new tab. Drag nodes, drag from a node's right-hand dot onto
   another's left dot to connect, click a node to configure it.
3. **Run it** — press Run and stay on the canvas: nodes light up in order with their
   own timings, and the run pauses at the approval gate.
4. **Approve it** — as `editor-a`, approve from the execution bar. Execution resumes
   and completes; the gate records who decided and when.
5. **Start it from outside** — open the webhook trigger, switch it **Live**, and call
   it:

   ```bash
   curl -X POST "$APP_BASE_URL/api/webhooks/<trigger_id>" \
     -H 'x-webhook-secret: <secret>' \
     -H 'content-type: application/json' \
     -d '{"text":"Your courier lost my parcel","customer":"acme"}'
   ```

   The run appears in **Executions** by itself, tagged `webhook` and attributed to no
   user. The panel shows the URL, the secret and a copy-ready `curl`, and has a
   *Send a test request* button.

6. **Prove the isolation** — as `owner-b`, paste Org A's workflow and run URLs. Both
   render *not found*: Hasura returned no row. `triggerWorkflowRun` and `approveStep`
   with Org A ids are refused 403. Org A's ids are on its Settings page, so the
   guessing can be deliberate.

---

## Testing

```bash
npm run dev          # in one terminal

npm run verify       # 75 checks
npm run test:nodes   # 58 checks
```

`verify` runs against the live project **using real end-user JWTs through the public
GraphQL endpoint** — not the admin secret, and not the app's own code paths:

| Section | Covers |
| --- | --- |
| 1 | Cross-org isolation: list queries, `_by_pk` id guessing, the usage view, member lists, cross-org writes, secret exposure, unauthenticated reads |
| 2 | Layer 1: viewers cannot write, editors cannot manage members, positive controls |
| 3 | Layer 2: editors refused `db_write` / `notify` / webhook, refused type-escalation on update, owners allowed; LLM connections owner-only, `api_key` unreadable by anyone, cannot be moved between orgs |
| 4 | `workflow_runs` / `step_runs` / `workflow_outputs` unwritable by any role; owners cannot raise their own quota |
| 5 | A full run: real LLM, real HTTP, branch, pause, viewer and cross-org approval refused, editor approval, resume, skip semantics, output passing between nodes |
| 6 | Retry `attempt_count`, `QUOTA_EXCEEDED`, webhook secret checks, database-event and cron handlers |
| 7 | Per-trigger webhook settings: method gating, all three secret locations, required fields refusing a call before a run exists, respond-when-finished, secret rotation invalidating the old value |
| 8 | Action wiring: schema shape, role permissions, and the handler's half of the Action protocol |

`test:nodes` builds a throwaway workflow per case, runs it through the real Action
handler, asserts on the resulting `step_runs`, then deletes it — covering every node
type, all twelve branch operators, retry counts, the SSRF guard, timeouts, approval
and rejection, dangling edges and cycles. It restores the organization's quota when
it finishes.

One check is reported as **SKIP** while `APP_BASE_URL` is localhost: Hasura calling
the handler over the internet, which only becomes possible once deployed. The
handler's side of that protocol is asserted separately.

---

## Architecture

The full write-up is in [ARCHITECTURE.md](./ARCHITECTURE.md).

```
browser ── GraphQL (queries, mutations, subscriptions) ──► Hasura ──► PostgreSQL
   │                                                        │
   └── Action mutation ──► Hasura ──► Next.js handler ───────┘
                                       (engine: nodes, retry, branch, pause)
        row change ──► Event Trigger ──► handler
        Hasura cron ─► Cron Trigger ───► handler
```

**Data model.** `organizations → org_members → workflows → workflow_steps /
workflow_triggers`, and `workflows → workflow_runs → step_runs`. Every row a
permission must reach is at most three joins from `org_members`.

**The graph.** `workflow_steps.next` maps an output handle to the *key* of the next
node (`{"main": "log_api"}`, or `{"true": "gate", "false": "save"}` for a condition),
with `canvas_x`/`canvas_y` for layout. Edges reference `key` rather than `id` because
saving replaces the step rows. `position` remains the topological order, recomputed
on save, and orders the run timeline.

**One Hasura role, not three.** A Hasura role arrives in the JWT and is global to the
user; an org role belongs to a `(user, organization)` pair — the same person can own
Org A and be a viewer in Org B. So all access uses the single `user` role, and
Layer 1 is a row-level predicate resolving the org role through `org_members` against
`X-Hasura-User-Id` on every request.

**Layer 2** lives in the same permission checks: `db_write` / `notify` nodes and
webhook triggers require owner, enforced on **insert and update** (so an editor
cannot create an allowed node and then patch its `type`), with
`workflow_triggers.type` immutable for the same reason. The Action handlers check it
again.

**Approvals cannot be a row permission**, because clearing a gate is a decision about
a run in flight. `workflow_runs` and `step_runs` therefore grant **no write
permission to any role**: the engine is their only writer. `approveStep` re-checks
the caller's role in that run's organization, confirms the step really is a paused
`approval_gate`, and applies the transition with `status = paused` still in the
`WHERE` clause so two racing approvers cannot both resume the run.

**Pause and resume** need no held connection and no timer: the run's state is rows in
PostgreSQL. Reaching a gate sets the node and the run to `paused` and returns.
Approving records the decision and calls the runner again, which continues from the
first still-pending node.

---

## Deployment

The app and its handlers deploy as one Next.js application.

1. Deploy to Vercel (or any Node host) and note the URL.
2. Set the environment variables there — everything from `.env.local` except
   `NEXT_PUBLIC_ACTION_TRANSPORT`, plus `APP_BASE_URL=https://<deployment>`.
3. Point Hasura at it:

   ```bash
   APP_BASE_URL=https://<deployment> npm run hasura:apply
   ```

   That rewrites the Action, Event Trigger and Cron Trigger URLs in the Hasura
   metadata and re-asserts consistency.
4. `npm run verify` — section 7's end-to-end check now passes instead of skipping.

`maxDuration` is 60s on the run-executing routes. A run that exceeds it stops
mid-flight and the nodes already recorded stay recorded. For longer workflows, move
the engine behind a queue: it is a plain function, `executeRun(runId)`, so it can be
called from anywhere.

---

## Repository layout

```
nhost/
  migrations/default/
    1786480000000_init/          schema, aggregation view, SQL functions
    1786490000000_step_graph/    node keys, edges, canvas coordinates
  metadata/
    app-tables.yaml              tracking, relationships, BOTH permission layers
    actions.yaml                 7 Actions (+ generated actions.graphql)
    functions.yaml               admin-only tracked SQL functions
    cron-triggers.yaml           the scheduler
    auth-overrides.yaml          narrow additive auth.users select permission
    exported-metadata.json       the full live metadata, secrets redacted
scripts/
  db-apply · hasura-apply · seed · setup · verify · test-nodes
src/
  server/
    auth.ts                      caller identification and authorization
    engine/                      runner, nodes, templating, retry, HTTP, LLM
    actions/                     one module per Action
    notify.ts                    Event-Trigger-driven delivery
    triggers.ts                  database-event and schedule evaluation
  app/
    api/hasura/actions/*         Action handlers
    api/hasura/events/*          Event and Cron Trigger handlers
    api/webhooks/[triggerId]     REST alias for the webhook Action
    (auth)/                      sign in, sign up, password reset, verification
    (app)/                       dashboard, runs, members, settings
    (editor)/                    the full-screen workflow canvas
  components/canvas/             the node editor
  components/, hooks/, lib/
```

---

## Environment variables

Annotated in [.env.example](./.env.example). The ones that matter:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_NHOST_SUBDOMAIN`, `NEXT_PUBLIC_NHOST_REGION` | yes | The only public values |
| `NHOST_ADMIN_SECRET` | yes | Setup scripts and engine writes |
| `HASURA_ACTION_SECRET`, `HASURA_WEBHOOK_SECRET` | yes | Generated by `hasura:apply` if absent |
| `APP_BASE_URL` | yes | Where Hasura calls the handlers |
| `NEXT_PUBLIC_ACTION_TRANSPORT` | no | `direct` for local development; unset in production |
| `LLM_PROVIDER`, `LLM_MODEL`, and the matching key | recommended | The deployment's fallback model. Without a key, `llm_call` uses a clearly-labelled stub. Per-organization endpoints are added in the app and need nothing here |
| `LLM_BASE_URL`, `LLM_API_KEY` | no | For `LLM_PROVIDER=custom` — any OpenAI-compatible host |
| `SLACK_WEBHOOK_URL`, `SMTP_*` | no | Only for real `notify` delivery; the demo uses the `log` channel |
| `ALLOW_PRIVATE_HTTP_TARGETS` | no | Defaults to false, keeping `http_request` from becoming an SSRF proxy |

---

## Troubleshooting

**"http exception when calling webhook", or a banner saying the Action handler is
unreachable.** Hasura is still calling whatever `APP_BASE_URL` was set to when
metadata was last applied — usually `http://localhost:3000` from before the first
deploy. The app detects this and calls the handler directly instead, so the UI keeps
working, but **schedules and Event Triggers have no such fallback and will not
fire**. Fix it properly:

```bash
APP_BASE_URL=https://your-deployment.vercel.app npm run hasura:apply
```

Set the same value in the deployment's own environment, and re-run
`npm run verify` — the one skipped check then passes.

For local development, `NEXT_PUBLIC_ACTION_TRANSPORT=direct` avoids the round trip
entirely.

**A webhook call returns 409.** Both gates must be open: the workflow's **Active**
switch and the trigger's **Live** switch. The response body names which one.

**Sign-in fails with an empty response.** Nhost Auth rate-limits sign-ins per IP
(HTTP 429). The scripts cache sessions in `.auth-cache.json` and back off; if it has
been hammered, wait a few minutes.

**`llm_call` output says `"stubbed": true`.** No provider key is set, so the labelled
stub was used. Either set `GROQ_API_KEY` (or another provider's key) for the
deployment, or add an LLM connection in the app and pick it in the node's
**Connection** field.

**An LLM connection to `localhost` fails.** Private and loopback addresses are
refused by the same SSRF guard the `http_request` node uses. Set
`ALLOW_PRIVATE_HTTP_TARGETS=true` to reach a local Ollama or vLLM — and note that a
deployed app cannot reach your machine at all, whatever that flag says.

**`Saved connections are unavailable: field 'llm_connections' not found`.** The
migration or the metadata has not been applied. Run `npm run db:apply` then
`npm run hasura:apply`, and reload the page.

**A notification stays `pending`.** Delivery is performed by the
`notification_created` Event Trigger, which needs Hasura to reach `APP_BASE_URL`. The
row is created either way, which is why the run does not fail.

**Password reset and verification links.** Nhost sends these and redirects back to
`/reset-password` and `/verified`. The app's origin must be in the Nhost project's
allowed redirect URLs (Settings → Authentication). The demo accounts are seeded
pre-verified, so this is not needed to review the app.

**`npm run db:reset` and existing accounts.** Reset drops only this app's objects in
`public`. The `auth` schema — and every user — is untouched, so re-run
`npm run seed` afterwards to recreate organizations and memberships.
