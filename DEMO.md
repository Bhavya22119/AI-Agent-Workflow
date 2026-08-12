# Demo script

A ~6 minute walkthrough covering the six things the final task asks to be shown live.
Everything below is already seeded, so nothing has to be built during the recording.

## Before you start

```bash
npm run dev        # terminal 1
```

Open two browser windows side by side, so the cross-tenant part needs no logging out:

| Window | Account | Role |
| --- | --- | --- |
| left | `owner-a@agentflow.test` | owner, Org A — *Northwind Support* |
| right | `owner-b@agentflow.test` | owner, Org B — *Contoso Logistics* |

Password for every account: `Password123!`. A third tab signed in as
`editor-a@agentflow.test` is handy for the approval step, and `viewer-a@agentflow.test`
if you want to show the read-only case.

Have this ready to paste in a terminal (`npm run seed` prints it filled in):

```bash
curl -X POST "http://localhost:3000/api/webhooks/<TRIGGER_ID>" \
  -H 'x-webhook-secret: <SECRET>' \
  -H 'content-type: application/json' \
  -d '{"text":"Your courier lost my parcel and nobody will help me","customer":"acme"}'
```

---

## 1. Two organizations, their own users and roles  *(~40s)*

Left window, **Members**: three people in Org A with owner / editor / viewer, and a
note of what each role may do. Right window: Org B has one member. The org switcher in
each window lists only that user's own organizations.

> Say: *roles are per-organization, not per-user — that is why they live in
> `org_members` and are resolved by every Hasura permission, rather than being Hasura
> roles from the JWT.*

## 2. The workflow  *(~50s)*

Left window → **Support ticket triage**. Six steps, and the assignment's required three
types are all here: `llm_call`, `http_request`, `conditional_branch`, plus the
`approval_gate`.

Open step 3 and show the condition: it tests `{{steps.1.output.text}}` — the LLM's
answer, not the HTTP response — for `negative`, and routes **true → step 4** (the
approval gate) and **false → step 6** (straight to the database write). So the LLM's
output genuinely changes what happens next.

Show the arrow buttons reordering a step, and the **Add step** menu: `db_write` and
`notify` are visibly locked with *owner only*.

## 3. Run it manually, live  *(~70s)*

Press **Run**. The run page shows the same graph with live status on each node, and a
timeline underneath. Without touching anything:

- step 1 `llm_call` → **Running** → **Done**, output shows the classification and which
  provider answered
- step 2 `http_request` → **Done**, HTTP 200
- step 3 condition → **Done**, `true → step 4`
- step 4 `approval_gate` → **Awaiting approval**, and the run badge switches to
  *Awaiting approval*
- the `db_write` node stays untouched, because that path has not been reached yet

> Say: *this is one GraphQL subscription on `step_runs` filtered by
> `workflow_run_id`. Nothing is polled, and the paused state is a row in Postgres, not
> a held connection.*

Expand step 1 to show input and output; the input is the fully rendered prompt.

## 4. Approve it, as somebody else  *(~50s)*

Switch to the `editor-a` tab, open the same run (Runs → the paused one). The **Approve
and continue** panel is on the paused step. Add a note, press it.

Both tabs update, on the canvas and in the timeline: `notify` → Done, `db_write` →
Done, run → **Completed**.
Expand step 4: it records who approved and when. Scroll down: the **Database writes**
card shows the row `db_write` inserted, with values pulled from three different earlier
steps — including `escalated: true`, which only existed after the pause.

If you want the negative case: as `viewer-a` the Approve buttons are simply absent,
the Run button is replaced by *view only*, and the canvas is read-only.

A good extra beat: run it again with a *positive* message and watch the condition take
the **false** connection, leaving the gate and notify nodes greyed out as **skipped**
while the run still completes.

## 5. Start a run with no button click  *(~40s)*

Paste the `curl` above. It returns `202` with a run id. On the dashboard, **Live
activity** grows a new row by itself, tagged `webhook`, with no refresh.

> Say: *that is the `triggerWorkflowWebhook` Hasura Action, exposed to the
> unauthorized `public` role. There is no user session, so the credential is a
> per-trigger secret that is not readable through the GraphQL API at all.*

Optionally also: open the workflow's **Database event** trigger and press *Insert a test
row* — a Hasura Event Trigger on `watched_records` starts another run.

## 6. Prove Org B cannot touch Org A  *(~80s)*

Right window, as `owner-b`. Copy Org A's ids from the left window's **Settings** page so
you are guessing them deliberately.

1. The dashboard lists only *Delivery note review*. Org A's workflow is absent.
2. Paste Org A's workflow URL — `/workflows/<org-a-workflow-id>` → **Workflow not
   found**. Hasura returned no row.
3. Paste Org A's paused run URL — nothing. The step subscription streams nothing either.
4. Open the browser console and try it as raw GraphQL, so nobody can claim the UI is
   doing the filtering:

   ```js
   await fetch('https://<subdomain>.hasura.<region>.nhost.run/v1/graphql', {
     method: 'POST',
     headers: {
       'content-type': 'application/json',
       authorization: 'Bearer ' + JSON.parse(localStorage.getItem('nhostSession')).accessToken,
     },
     body: JSON.stringify({
       query: `{ workflows_by_pk(id: "<ORG_A_WORKFLOW_ID>") { id name }
                 organizations_by_pk(id: "<ORG_A_ORG_ID>") { name quota_limit } }`,
     }),
   }).then((r) => r.json());
   ```

   Both come back `null`.

> Close with: *and the same is true of the Actions — `triggerWorkflowRun` and
> `approveStep` with Org A ids return 403, because each handler re-checks the caller's
> role in that row's organization. `npm run verify` asserts all of this, plus retry,
> quota and the trigger types, as 75 checks.*

---

## Optional closer: the verification suite  *(~30s)*

```bash
npm run verify
```

Scroll the output: cross-org isolation, both permission layers, engine tables being
unwritable, the full run with pause and resume, retry `attempt_count`, quota refusal,
and each trigger type. 75 passed, 0 failed — and one honest **SKIP** for the
Hasura-calls-the-handler-over-the-internet check, which only becomes possible once the
app is deployed.

---

## Things worth mentioning if asked

- **Why one Hasura role?** A Hasura role comes from the JWT and is global to the user;
  an org role belongs to a `(user, org)` pair. Modelling org roles as Hasura roles
  cannot express "owner in A, viewer in B".
- **Why can't approval be a permission?** It is a decision about a run in flight.
  `workflow_runs` and `step_runs` therefore grant no write permission to anybody, so
  the Action is the only path — which also stops a viewer from creating a run row to
  dodge the quota.
- **What stops an editor sneaking a `db_write` in?** The Layer-2 predicate is on
  `update` as well as `insert`, and `workflow_triggers.type` is not updatable at all.
- **Retry:** `attempt_count` is written before each attempt, so a retry is visible in
  the UI as it happens rather than inferred afterwards.
