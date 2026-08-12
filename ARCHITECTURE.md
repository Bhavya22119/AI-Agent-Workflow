# Architecture write-up

## 1. Schema reasoning

```
organizations ──┬── org_members ── auth.users
                ├── workflows ──┬── workflow_steps
                │               ├── workflow_triggers
                │               └── workflow_runs ── step_runs
                ├── workflow_outputs      (written by db_write steps)
                ├── notifications         (written by notify steps)
                └── watched_records       (the table database_event triggers watch)
```

The organizing constraint was: **every row that a permission check has to reach must be
a short, indexed walk away from `org_members`**, because that predicate runs on every
single request. Nothing is more than three joins out, and
`idx_org_members_user_org_role (user_id, org_id, role)` covers the lookup.

Two denormalisations are deliberate. `workflow_runs.org_id` is copied from the workflow
so run and step permissions — and quota accounting — never join through `workflows`.
`step_runs.step_type` is copied from `workflow_steps` at run creation, so editing a
workflow later cannot retroactively change what a historical run appears to have done.

The graph itself lives in `workflow_steps.next`: a JSONB map from output handle to
the **key** of the next step — `{"main": "log_api"}` for an ordinary step,
`{"true": "gate", "false": "save_result"}` for a condition. Edges reference `key`
and not `id` for a concrete reason: saving a workflow deletes and re-inserts its
steps (positions are unique per workflow, so an in-place reorder would collide
mid-statement), so row ids change on every save while client-generated keys do not.
`canvas_x`/`canvas_y` carry the layout. `position` is kept as the topological order,
recomputed from a walk of the graph on save, and it is what orders `step_runs` in
the run timeline and what `{{steps.N.output}}` refers to.

Step-specific settings live in a `config` JSONB column: six step types with
genuinely different shapes would otherwise mean six sparse column families or six
tables, and the engine validates each type's config when it runs it. What is *not* in
JSONB is anything the database must reason about — `type`, `position`, `retry_limit`,
`timeout_ms` are real columns because permissions and constraints depend on them.

Enums are Postgres `ENUM` types rather than text + CHECK, so Hasura exposes them as
GraphQL enums and an invalid step type is rejected at the API boundary. `run_status`
includes `paused` (required) plus `cancelled` for a rejected approval.

The aggregation is a Postgres view, `org_usage_summary`: quota consumed this period,
remaining, percentage, run counts by state, and **average run duration**. It is tracked
in Hasura with a *manual* relationship back to `organizations`, so the same
`org_members` predicate protects it as protects every table. This is worth being
deliberate about: an uncorrelated `_exists` filter on a view compiles and looks
right while returning every organization's usage numbers to any logged-in user. `organizations.avg_run_duration_ms`
is additionally exposed as a Hasura computed field over a `STABLE` SQL function.

Three functions carry logic that must be transactional. `start_workflow_run()`
re-checks membership and role, checks quota under a `SELECT … FOR UPDATE` on the
organization row, and inserts the run **together with all of its `step_runs`** — so a
subscription never observes a run with a partial set of steps, and two concurrent
triggers cannot both take the last unit of quota. `consume_run_quota()` increments the
counter at most once per run, guarded by `workflow_runs.quota_counted`. A constraint
trigger prevents an organization from being left with no owner. Both functions are
tracked in Hasura with **no role permissions**, so they are reachable only with the
admin secret — and because they are tracked, every call is a parameterised GraphQL
variable rather than a concatenated SQL string.

## 2. The two permission layers, enforced differently

### Why there is one Hasura role and not three

A Hasura role arrives in the JWT (`x-hasura-default-role`) and is therefore a property
of the **user**, globally. An org role is a property of the **(user, organization)
pair** — the same person can own Org A and be a viewer in Org B. Modelling org roles as
Hasura roles cannot express that, and in practice collapses to whichever role the user
holds most permissively. It also fails quietly: Nhost issues only `user` and `me`, so
defining `owner` / `editor` / `viewer` Hasura roles produces permission sets that no
request ever selects — dead configuration, while whatever the `user` role permits is
the real, exploitable surface.

So **Layer 1 is a row-level predicate**, evaluated per request on the single `user`
role:

```yaml
filter:
  organization:
    org_members:
      _and:
        - user_id: { _eq: X-Hasura-User-Id }
        - role:    { _in: [owner, editor] }
```

Anchored on `X-Hasura-User-Id` from the signed token, never on anything in the request.
The consequence that matters for the grading scenario: another tenant's row is simply
not in the result set, so `workflows_by_pk(id: <guessed>)` returns `null` rather than an
error — indistinguishable from a deleted row, so the endpoint is not even an existence
oracle. Read is any member; create/edit is owner or editor; delete is owner; a viewer
gets select only.

### Layer 2 — step-level gating, in the same place and again in the handler

`db_write` and `notify` steps and `webhook` triggers reach outside the sandbox, so only
an owner may create them. As a Hasura check:

```yaml
check:
  _or:
    - workflow: { organization: { org_members: { _and: [ {user_id: {_eq: X-Hasura-User-Id}}, {role: {_eq: owner}} ] } } }
    - _and:
        - workflow: { organization: { org_members: { _and: [ {user_id: {_eq: X-Hasura-User-Id}}, {role: {_eq: editor}} ] } } }
        - type: { _nin: [db_write, notify] }
```

Two details make this hold rather than merely look right. The same predicate is applied
to **update** as well as insert — otherwise an editor creates an `llm_call` step and
patches its `type` to `db_write`. And `workflow_triggers.type` is absent from the update
column list, making a trigger's kind immutable, so a manual trigger cannot be converted
into a webhook. The Action handlers re-check the same rule, so the UI's disabled buttons
are a courtesy, not the enforcement.

### Why approvals cannot be a permission at all

Clearing an approval gate is a decision about a run **in flight**, not a row read or
write, so it is enforced in the Action handler. To make that the *only* path,
`workflow_runs`, `step_runs`, `workflow_outputs` and `notifications` grant **no write
permission to any role**: the engine, holding the admin secret, is their only writer.
That single decision is what makes three separate claims structural rather than
conventional — a viewer cannot start a run, nobody can flip a paused step to
`completed`, and quota cannot be side-stepped by inserting a run row directly.

`approveStep` then, in order: takes the caller from the verified session (never from the
body); loads the `step_run` and returns the *same* opaque error for "does not exist" and
"belongs to another organization"; requires the caller's role in **that step's**
organization, intersecting the gate's configured `approver_roles` with what the product
permits, so config can tighten the rule to owner-only but can never let a viewer
through; confirms the step really is an `approval_gate` and really is `paused`; and
applies the transition with `status = paused` still in the `WHERE` clause, so if two
approvers race, exactly one affects a row and the other is told the gate already moved.

Identity itself is established two ways, both cryptographic. With
`x-hasura-action-secret` present and correct, the request provably came from our Hasura
instance, which has already validated the JWT — so `session_variables` is trusted. With
a bearer token instead, the token is verified against Nhost Auth and the body's
`session_variables` is ignored entirely. A wrong action secret is a 401, not a fallback.
The rule exists because the alternative is catastrophic and easy to reach for: an
approve endpoint that trusts a `user_id` field in its request body lets anyone clear
anyone's approval gate by guessing a UUID.

## 3. Pause and resume

There is no held connection, no timer, and no in-memory state. A run's position **is**
rows in Postgres, which is why resuming is just another function call:

1. The runner walks the graph from the entry node — the one nothing points at —
   following each step's `next` edge and passing each output to the following step.
   (It deliberately does *not* start at the lowest `position`: that looks
   equivalent only because positions are normally assigned by a topological walk,
   and silently executes the wrong node when they are not.)
2. On an `approval_gate` it writes the step to `paused` and the run to `paused`, then
   returns. The step's output records the message and who may approve.
3. `approveStep` records `approved_by` / `approved_at` / note, marks the step
   `completed`, and calls `executeRun(runId)` again.
4. The runner rebuilds its templating context from the outputs of already-completed
   steps and continues from **the first still-pending step** — which, because the gate
   is now `completed`, is exactly the step after it. No stored cursor to get wrong.

`claimRun()` moves a run from `pending`/`paused` to `running` in one conditional update
and reports whether the caller won, so a double-clicked Approve or a webhook and the
scheduler firing together cannot drive the same run twice.

A `conditional_branch` decides only *which of its two outputs* is taken; where that
output goes is the connection drawn on the canvas. When the run finishes, every node
it never reached is marked `skipped` rather than left `pending`, so both the canvas
and the timeline show the path actually taken. A revisited node aborts the run with a
"loops are not supported" error rather than spinning, a dangling edge fails loudly
instead of silently ending, and `MAX_STEPS_PER_RUN` is a final backstop.

Because everything the UI renders is written as it happens, the required subscription on
`step_runs` filtered by `workflow_run_id` is the whole live-progress mechanism —
including the `paused, awaiting approval` state. Hasura applies the same row
permissions to a subscription as to a query, so an Org B user subscribing with an Org A
run id gets an empty stream rather than someone else's data.

## 4. Retry, failure and quota

`llm_call` and `http_request` run through `withRetry`, using the step's `retry_limit`
(extra attempts after the first, default 1) with exponential backoff and jitter. Every
attempt writes `step_runs.attempt_count` **before** it runs, so a retry is visible live
rather than inferred afterwards. Retries are classified, not blind: HTTP 429 and 5xx and
provider timeouts retry; a 4xx is a real answer and fails immediately; an SSRF-guard
rejection never retries. A failed step records its error, fails the run with the step
number in the message, and stops.

`http_request` targets are checked before the call: http/https only, hostname resolved,
and every resulting address must be public — which blocks loopback, RFC1918,
link-local, and the `169.254.169.254` metadata endpoint. Redirects are surfaced rather
than followed, so a redirect cannot bounce a request into private space. A step that
lets users name any URL is otherwise an SSRF proxy with the host's network position.

Quota is enforced at the start and consumed at the end. The gate compares
`quota_used + in-flight runs` against `quota_limit` inside `start_workflow_run()`, under
a row lock, so concurrent triggers cannot collectively overshoot — refusing with
`QUOTA_EXCEEDED`, which the handler maps to HTTP 429. Consumption happens once per run
that reaches a terminal state, via `consume_run_quota()`. That is a deliberate
widening of "increment on completion": counting only successes would make a workflow
that always fails free to run forever. `quota_limit` is not in any update permission —
a tenant that can raise its own limit does not have one — so changing it needs the admin
secret. The period rolls forward lazily: the first run of a new month resets the
counter.
