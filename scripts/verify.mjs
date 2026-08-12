#!/usr/bin/env node
/**
 * Proves the things this assignment is graded on, against the live project,
 * using real end-user JWTs through the public GraphQL endpoint — not the admin
 * secret, and not the app's own UI code paths.
 *
 *   node scripts/verify.mjs
 *
 * Sections:
 *   1. Cross-organization isolation, including direct id guessing
 *   2. Layer 1 — org + role scoping
 *   3. Layer 2 — step-level gating (db_write / notify / webhook)
 *   4. Engine surfaces that must not be writable from a client
 *   5. End-to-end execution: branch, pause, approve, resume, skip
 *   6. Retry, quota, webhook trigger, scheduled + database-event triggers
 *
 * Sections 5 and 6 need the Action handlers running, i.e. `npm run dev` in
 * another terminal. If the app is not reachable they are reported as SKIPPED
 * rather than silently passing.
 */
import { config, env } from './lib/env.mjs';
import { adminGql, anonGql, userGql, log } from './lib/hasura.mjs';
import { getSession } from './lib/session-cache.mjs';

const APP = config.appBaseUrl();
const PASSWORD = 'Password123!';

const results = { pass: 0, fail: 0, skip: 0, failures: [] };
let currentSection = '';

function section(title) {
  currentSection = title;
  console.log(`\n\x1b[1m\x1b[36m── ${title}\x1b[0m`);
}

function check(name, ok, detail = '') {
  if (ok) {
    results.pass += 1;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    results.fail += 1;
    results.failures.push(`[${currentSection}] ${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function skip(name, why) {
  results.skip += 1;
  console.log(`  \x1b[33mSKIP\x1b[0m ${name} — ${why}`);
}

/** True when a GraphQL envelope carries an error (i.e. the server refused). */
function refused(envelope) {
  return Array.isArray(envelope?.errors) && envelope.errors.length > 0;
}

function errorText(envelope) {
  return refused(envelope) ? envelope.errors.map((e) => e.message).join('; ') : '(no error)';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Cached so repeated runs do not trip Nhost Auth's per-IP sign-in rate limit. */
function signIn(email) {
  return getSession(email, PASSWORD);
}

/** Calls an Action handler the way the browser does on the direct transport. */
async function callAction(route, input, token) {
  const res = await fetch(`${APP}/api/hasura/actions/${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action: { name: route }, input }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ok: res.ok };
}

async function appReachable() {
  try {
    const res = await fetch(`${APP}/api/hasura/actions/trigger-workflow-run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });
    // Any HTTP answer means the route exists; 401 is the expected refusal.
    return res.status > 0;
  } catch {
    return false;
  }
}

async function waitForRun(runId, predicate, timeoutMs = 90000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const data = await adminGql(
      `query RunState($id: uuid!) {
         workflow_runs_by_pk(id: $id) {
           id status error
           step_runs(order_by: { position: asc }) {
             id position step_type status attempt_count error output
           }
         }
       }`,
      { id: runId },
    );
    last = data.workflow_runs_by_pk;
    if (last && predicate(last)) return last;
    await sleep(1200);
  }
  return last;
}

/* ========================================================================= */

async function main() {
  console.log(`\nVerifying ${config.subdomain}.${config.region}`);
  console.log(`App base URL: ${APP}`);

  const ownerA = await signIn('owner-a@agentflow.test');
  const editorA = await signIn('editor-a@agentflow.test');
  const viewerA = await signIn('viewer-a@agentflow.test');
  const ownerB = await signIn('owner-b@agentflow.test');
  log.ok('signed in as all four seeded accounts');

  const orgs = await adminGql(
    `query Orgs {
       a: organizations(where: { slug: { _eq: "northwind-support" } }) {
         id
         workflows { id name workflow_steps(order_by: { position: asc }) { id type position } }
       }
       b: organizations(where: { slug: { _eq: "contoso-logistics" } }) { id workflows { id name } }
     }`,
  );
  const orgA = orgs.a[0];
  const orgB = orgs.b[0];
  if (!orgA || !orgB) throw new Error('Demo orgs are missing. Run "npm run seed".');
  const workflowA = orgA.workflows.find((w) => w.name === 'Support ticket triage');
  const workflowB = orgB.workflows[0];
  const llmStepA = workflowA.workflow_steps.find((s) => s.type === 'llm_call');

  /* ------------------------------------------------------------------ 1 */
  section('1. Cross-organization isolation (Org B user vs Org A data)');

  const listAsB = await userGql(
    ownerB.token,
    `query { workflows { id name } organizations { id name } }`,
  );
  const bWorkflowIds = (listAsB.data?.workflows ?? []).map((w) => w.id);
  check(
    'Org B listing workflows sees only its own',
    bWorkflowIds.length === 1 && bWorkflowIds[0] === workflowB.id,
    `saw ${JSON.stringify(bWorkflowIds)}`,
  );
  check(
    'Org B listing organizations sees only its own',
    (listAsB.data?.organizations ?? []).every((o) => o.id === orgB.id),
    JSON.stringify(listAsB.data?.organizations),
  );

  const byPk = await userGql(
    ownerB.token,
    `query ($wf: uuid!, $org: uuid!, $step: uuid!) {
       workflows_by_pk(id: $wf) { id name }
       organizations_by_pk(id: $org) { id name quota_limit }
       workflow_steps_by_pk(id: $step) { id type config }
     }`,
    { wf: workflowA.id, org: orgA.id, step: llmStepA.id },
  );
  check(
    'Org B guessing Org A workflow id by pk gets null',
    byPk.data?.workflows_by_pk === null,
    JSON.stringify(byPk.data?.workflows_by_pk),
  );
  check(
    'Org B guessing Org A organization id by pk gets null',
    byPk.data?.organizations_by_pk === null,
    JSON.stringify(byPk.data?.organizations_by_pk),
  );
  check(
    'Org B guessing an Org A step id by pk gets null',
    byPk.data?.workflow_steps_by_pk === null,
    JSON.stringify(byPk.data?.workflow_steps_by_pk),
  );

  const usageAsB = await userGql(
    ownerB.token,
    `query ($org: uuid!) { org_usage_summary(where: { org_id: { _eq: $org } }) { org_id quota_used } }`,
    { org: orgA.id },
  );
  check(
    "Org B cannot read Org A's usage aggregation",
    (usageAsB.data?.org_usage_summary ?? []).length === 0,
    JSON.stringify(usageAsB.data?.org_usage_summary),
  );

  const membersAsB = await userGql(
    ownerB.token,
    `query ($org: uuid!) { org_members(where: { org_id: { _eq: $org } }) { id role user { email } } }`,
    { org: orgA.id },
  );
  check(
    "Org B cannot read Org A's member list",
    (membersAsB.data?.org_members ?? []).length === 0,
    JSON.stringify(membersAsB.data?.org_members),
  );

  const renameAsB = await userGql(
    ownerB.token,
    `mutation ($org: uuid!) { update_organizations_by_pk(pk_columns: { id: $org }, _set: { name: "pwned" }) { id name } }`,
    { org: orgA.id },
  );
  check(
    'Org B cannot rename Org A',
    renameAsB.data?.update_organizations_by_pk === null || refused(renameAsB),
    JSON.stringify(renameAsB.data ?? renameAsB.errors),
  );

  const insertIntoA = await userGql(
    ownerB.token,
    `mutation ($org: uuid!) { insert_workflows_one(object: { org_id: $org, name: "injected" }) { id } }`,
    { org: orgA.id },
  );
  check(
    "Org B cannot create a workflow inside Org A",
    refused(insertIntoA),
    JSON.stringify(insertIntoA.data),
  );

  const secretProbe = await userGql(
    ownerA.token,
    `query { workflow_triggers { id type secret } }`,
  );
  check(
    'Webhook secrets are not selectable over GraphQL, even by an owner',
    refused(secretProbe) && /secret/i.test(errorText(secretProbe)),
    errorText(secretProbe),
  );

  const anonRead = await anonGql(`query { workflows { id } }`);
  check(
    'Unauthenticated callers cannot read workflows at all',
    refused(anonRead),
    errorText(anonRead),
  );

  /* ------------------------------------------------------------------ 2 */
  section('2. Layer 1 — org + role scoping');

  const viewerSees = await userGql(viewerA.token, `query { workflows { id } }`);
  check(
    'Viewer in Org A can read its workflows',
    (viewerSees.data?.workflows ?? []).length >= 1,
    JSON.stringify(viewerSees.errors),
  );

  const viewerInsert = await userGql(
    viewerA.token,
    `mutation ($org: uuid!) { insert_workflows_one(object: { org_id: $org, name: "viewer wrote this" }) { id } }`,
    { org: orgA.id },
  );
  check('Viewer cannot create a workflow', refused(viewerInsert), JSON.stringify(viewerInsert.data));

  const viewerEditStep = await userGql(
    viewerA.token,
    `mutation ($id: uuid!) { update_workflow_steps_by_pk(pk_columns: { id: $id }, _set: { name: "viewer edit" }) { id } }`,
    { id: llmStepA.id },
  );
  check(
    'Viewer cannot edit a step',
    refused(viewerEditStep) || viewerEditStep.data?.update_workflow_steps_by_pk === null,
    JSON.stringify(viewerEditStep.data ?? viewerEditStep.errors),
  );

  const editorEditsWorkflow = await userGql(
    editorA.token,
    `mutation ($id: uuid!) { update_workflows_by_pk(pk_columns: { id: $id }, _set: { description: "edited by the editor" }) { id } }`,
    { id: workflowA.id },
  );
  check(
    'Editor can edit a workflow (positive control)',
    !refused(editorEditsWorkflow) && editorEditsWorkflow.data?.update_workflows_by_pk?.id,
    errorText(editorEditsWorkflow),
  );

  const editorAddsMember = await userGql(
    editorA.token,
    `mutation ($org: uuid!, $user: uuid!) {
       insert_org_members_one(object: { org_id: $org, user_id: $user, role: owner }) { id }
     }`,
    { org: orgA.id, user: ownerB.userId },
  );
  check(
    'Editor cannot add members',
    refused(editorAddsMember),
    JSON.stringify(editorAddsMember.data),
  );

  /* ------------------------------------------------------------------ 3 */
  section('3. Layer 2 — step-level gating');

  const editorAddsLlm = await userGql(
    editorA.token,
    `mutation ($wf: uuid!) {
       insert_workflow_steps_one(
         object: { workflow_id: $wf, position: 90, key: "probe_llm", type: llm_call, name: "probe" }
       ) { id }
     }`,
    { wf: workflowA.id },
  );
  const probeStepId = editorAddsLlm.data?.insert_workflow_steps_one?.id;
  check(
    'Editor CAN add an llm_call step (positive control)',
    Boolean(probeStepId),
    errorText(editorAddsLlm),
  );

  for (const type of ['db_write', 'notify']) {
    const attempt = await userGql(
      editorA.token,
      `mutation ($wf: uuid!, $type: step_type!, $key: String!) {
         insert_workflow_steps_one(
           object: { workflow_id: $wf, position: 91, key: $key, type: $type, name: "probe" }
         ) { id }
       }`,
      { wf: workflowA.id, type, key: `probe_${type}` },
    );
    check(`Editor cannot add a ${type} step`, refused(attempt), JSON.stringify(attempt.data));
  }

  if (probeStepId) {
    const escalate = await userGql(
      editorA.token,
      `mutation ($id: uuid!) { update_workflow_steps_by_pk(pk_columns: { id: $id }, _set: { type: db_write }) { id type } }`,
      { id: probeStepId },
    );
    check(
      'Editor cannot convert an existing step into db_write (update is gated too)',
      refused(escalate) || escalate.data?.update_workflow_steps_by_pk === null,
      JSON.stringify(escalate.data ?? escalate.errors),
    );
  }

  const editorWebhook = await userGql(
    editorA.token,
    `mutation ($wf: uuid!) {
       insert_workflow_triggers_one(object: { workflow_id: $wf, type: webhook }) { id }
     }`,
    { wf: workflowA.id },
  );
  check(
    'Editor cannot add a webhook trigger',
    refused(editorWebhook),
    JSON.stringify(editorWebhook.data),
  );

  const editorSchedule = await userGql(
    editorA.token,
    `mutation ($wf: uuid!) {
       insert_workflow_triggers_one(object: { workflow_id: $wf, type: scheduled, cron_expression: "*/30 * * * *" }) { id }
     }`,
    { wf: workflowA.id },
  );
  const scheduleProbeId = editorSchedule.data?.insert_workflow_triggers_one?.id;
  check(
    'Editor CAN add a schedule trigger (positive control)',
    Boolean(scheduleProbeId),
    errorText(editorSchedule),
  );

  const ownerAddsDbWrite = await userGql(
    ownerA.token,
    `mutation ($wf: uuid!) {
       insert_workflow_steps_one(
         object: { workflow_id: $wf, position: 92, key: "probe_owner_db", type: db_write, name: "probe" }
       ) { id }
     }`,
    { wf: workflowA.id },
  );
  const ownerProbeStep = ownerAddsDbWrite.data?.insert_workflow_steps_one?.id;
  check(
    'Owner CAN add a db_write step (positive control)',
    Boolean(ownerProbeStep),
    errorText(ownerAddsDbWrite),
  );

  // Clean the probes up so the demo workflow is left exactly as seeded.
  await adminGql(
    `mutation ($ids: [uuid!]!, $triggerIds: [uuid!]!) {
       delete_workflow_steps(where: { id: { _in: $ids } }) { affected_rows }
       delete_workflow_triggers(where: { id: { _in: $triggerIds } }) { affected_rows }
     }`,
    {
      ids: [probeStepId, ownerProbeStep].filter(Boolean),
      triggerIds: [scheduleProbeId].filter(Boolean),
    },
  );

  /* ------------------------------------------------------------------ 4 */
  section('4. Engine tables are not client-writable');

  const forgeRun = await userGql(
    ownerA.token,
    `mutation ($wf: uuid!, $org: uuid!) {
       insert_workflow_runs_one(object: { workflow_id: $wf, org_id: $org, status: completed }) { id }
     }`,
    { wf: workflowA.id, org: orgA.id },
  );
  check(
    'Even an owner cannot insert a workflow_run directly (quota cannot be bypassed)',
    refused(forgeRun),
    JSON.stringify(forgeRun.data),
  );

  const forgeStepRun = await userGql(
    ownerA.token,
    `mutation { update_step_runs(where: {}, _set: { status: completed }) { affected_rows } }`,
  );
  check(
    'Even an owner cannot update step_runs directly (no self-approval)',
    refused(forgeStepRun),
    JSON.stringify(forgeStepRun.data),
  );

  const forgeOutput = await userGql(
    ownerA.token,
    `mutation ($org: uuid!) {
       insert_workflow_outputs_one(object: { org_id: $org, workflow_run_id: "00000000-0000-0000-0000-000000000000", key: "x" }) { id }
     }`,
    { org: orgA.id },
  );
  check(
    'Clients cannot write workflow_outputs directly',
    refused(forgeOutput),
    JSON.stringify(forgeOutput.data),
  );

  const raiseQuota = await userGql(
    ownerA.token,
    `mutation ($org: uuid!) { update_organizations_by_pk(pk_columns: { id: $org }, _set: { quota_limit: 999999 }) { id quota_limit } }`,
    { org: orgA.id },
  );
  check(
    'An owner cannot raise their own quota_limit',
    refused(raiseQuota),
    JSON.stringify(raiseQuota.data),
  );

  /* ------------------------------------------------------------------ 5 */
  const reachable = await appReachable();
  section('5. End-to-end execution (branch, pause, approve, resume)');

  if (!reachable) {
    skip('every execution test', `${APP} is not responding — start the app with "npm run dev"`);
  } else {
    // --- viewers cannot trigger --------------------------------------------
    const viewerRun = await callAction(
      'trigger-workflow-run',
      { workflow_id: workflowA.id, payload: { text: 'viewer attempt' } },
      viewerA.token,
    );
    check(
      'Viewer calling triggerWorkflowRun is refused',
      viewerRun.status === 403,
      `HTTP ${viewerRun.status} ${JSON.stringify(viewerRun.json)}`,
    );

    // --- cross-org trigger --------------------------------------------------
    const crossOrgRun = await callAction(
      'trigger-workflow-run',
      { workflow_id: workflowA.id, payload: { text: 'org b attempt' } },
      ownerB.token,
    );
    check(
      "Org B calling triggerWorkflowRun on Org A's workflow is refused",
      crossOrgRun.status === 403 || crossOrgRun.status === 404,
      `HTTP ${crossOrgRun.status} ${JSON.stringify(crossOrgRun.json)}`,
    );

    // --- identity cannot be forged in the body ------------------------------
    const forgedIdentity = await fetch(`${APP}/api/hasura/actions/trigger-workflow-run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: { name: 'triggerWorkflowRun' },
        input: { workflow_id: workflowA.id },
        // Pretending to be the Org A owner, with no proof whatsoever.
        session_variables: { 'x-hasura-user-id': ownerA.userId, 'x-hasura-role': 'user' },
      }),
    });
    check(
      'A forged session_variables body without the action secret is rejected',
      forgedIdentity.status === 401,
      `HTTP ${forgedIdentity.status}`,
    );

    const badSecret = await fetch(`${APP}/api/hasura/actions/trigger-workflow-run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hasura-action-secret': 'wrong' },
      body: JSON.stringify({
        input: { workflow_id: workflowA.id },
        session_variables: { 'x-hasura-user-id': ownerA.userId },
      }),
    });
    check(
      'A wrong action secret is rejected rather than falling back',
      badSecret.status === 401,
      `HTTP ${badSecret.status}`,
    );

    // --- the negative path: LLM -> HTTP -> branch -> pause -----------------
    const negativeRun = await callAction(
      'trigger-workflow-run',
      {
        workflow_id: workflowA.id,
        payload: {
          text: 'Your courier lost my parcel, I am furious and I want a refund immediately.',
          customer: 'verify-negative',
        },
      },
      ownerA.token,
    );
    const negativeRunId = negativeRun.json?.workflow_run_id;
    check('Owner can trigger a run', Boolean(negativeRunId), JSON.stringify(negativeRun.json));

    if (negativeRunId) {
      const paused = await waitForRun(negativeRunId, (run) => run.status === 'paused' || run.status === 'failed');
      const llm = paused?.step_runs.find((s) => s.step_type === 'llm_call');
      const http = paused?.step_runs.find((s) => s.step_type === 'http_request');
      const branch = paused?.step_runs.find((s) => s.step_type === 'conditional_branch');
      const gate = paused?.step_runs.find((s) => s.step_type === 'approval_gate');

      check(
        'llm_call completed against a real provider',
        llm?.status === 'completed' && typeof llm?.output?.text === 'string',
        `status=${llm?.status} error=${llm?.error} output=${JSON.stringify(llm?.output)}`,
      );
      if (llm?.output) {
        log.info(
          `LLM said "${String(llm.output.text).trim()}" via ${llm.output.provider}${llm.output.stubbed ? ' (STUB — no API key configured)' : ''}`,
        );
      }
      check(
        'http_request completed against a real external API',
        http?.status === 'completed' && http?.output?.status === 200,
        `status=${http?.status} error=${http?.error}`,
      );
      check(
        'conditional_branch took the true path on a negative classification',
        branch?.status === 'completed' && branch?.output?.matched === true,
        `output=${JSON.stringify(branch?.output)}`,
      );
      check(
        'run is paused at the approval gate',
        paused?.status === 'paused' && gate?.status === 'paused',
        `run=${paused?.status} gate=${gate?.status} error=${paused?.error}`,
      );

      if (gate?.status === 'paused') {
        const viewerApprove = await callAction(
          'approve-step',
          { step_run_id: gate.id },
          viewerA.token,
        );
        check(
          'Viewer cannot approve the gate',
          viewerApprove.status === 403,
          `HTTP ${viewerApprove.status} ${JSON.stringify(viewerApprove.json)}`,
        );

        const orgBApprove = await callAction('approve-step', { step_run_id: gate.id }, ownerB.token);
        check(
          "Org B cannot approve Org A's gate even with the exact step_run_id",
          orgBApprove.status === 403 || orgBApprove.status === 404,
          `HTTP ${orgBApprove.status} ${JSON.stringify(orgBApprove.json)}`,
        );

        const editorApprove = await callAction(
          'approve-step',
          { step_run_id: gate.id, note: 'Approved by the verification script' },
          editorA.token,
        );
        check(
          'Editor in Org A can approve the gate',
          editorApprove.ok && editorApprove.json?.decision === 'approved',
          `HTTP ${editorApprove.status} ${JSON.stringify(editorApprove.json)}`,
        );

        const replay = await callAction('approve-step', { step_run_id: gate.id }, ownerA.token);
        check(
          'Approving an already-decided gate is refused',
          replay.status === 409,
          `HTTP ${replay.status} ${JSON.stringify(replay.json)}`,
        );

        const finished = await waitForRun(
          negativeRunId,
          (run) => run.status === 'completed' || run.status === 'failed',
        );
        check(
          'run resumes after approval and completes',
          finished?.status === 'completed',
          `status=${finished?.status} error=${finished?.error}`,
        );

        const approvedGate = finished?.step_runs.find((s) => s.step_type === 'approval_gate');
        check(
          'approved_by / approved_at are recorded on the gate',
          Boolean(approvedGate?.output?.approved_by) && approvedGate?.status === 'completed',
          JSON.stringify(approvedGate?.output),
        );

        const notifyStep = finished?.step_runs.find((s) => s.step_type === 'notify');
        const dbWriteStep = finished?.step_runs.find((s) => s.step_type === 'db_write');
        check(
          'notify step ran after the approval',
          notifyStep?.status === 'completed',
          `status=${notifyStep?.status} error=${notifyStep?.error}`,
        );
        check(
          'db_write step ran after the approval',
          dbWriteStep?.status === 'completed',
          `status=${dbWriteStep?.status} error=${dbWriteStep?.error}`,
        );

        const written = await adminGql(
          `query ($run: uuid!) {
             workflow_outputs(where: { workflow_run_id: { _eq: $run } }) { key value }
             notifications(where: { workflow_run_id: { _eq: $run } }) { channel status body }
           }`,
          { run: negativeRunId },
        );
        check(
          'db_write actually inserted a row into workflow_outputs',
          written.workflow_outputs.length === 1 &&
            written.workflow_outputs[0].key === 'triage_result',
          JSON.stringify(written.workflow_outputs),
        );

        // The db_write config interpolates three different earlier steps, so a
        // correct row here is a real test of output-passing between steps —
        // including a value produced *after* the pause.
        const value = written.workflow_outputs[0]?.value ?? {};
        const llmText = String(llm?.output?.text ?? '').trim().toLowerCase();
        check(
          'templating pulled the classification from step 1 into the db_write',
          typeof value.sentiment === 'string' && value.sentiment.trim().toLowerCase() === llmText,
          `db_write.sentiment=${JSON.stringify(value.sentiment)} llm=${JSON.stringify(llmText)}`,
        );
        check(
          'templating pulled the HTTP status from step 2 (across a type boundary)',
          String(value.ticket_api_status) === '200',
          `db_write.ticket_api_status=${JSON.stringify(value.ticket_api_status)}`,
        );
        check(
          'templating pulled the approval result from step 4, recorded after the pause',
          String(value.escalated) === 'true',
          `db_write.escalated=${JSON.stringify(value.escalated)}`,
        );
        check(
          'templating pulled the trigger payload into the db_write',
          value.customer === 'verify-negative',
          `db_write.customer=${JSON.stringify(value.customer)}`,
        );

        check(
          'notify inserted a notifications row for the Event Trigger to deliver',
          written.notifications.length === 1,
          JSON.stringify(written.notifications),
        );
        check(
          'the notification body was interpolated, not left as a template',
          typeof written.notifications[0]?.body === 'string' &&
            !written.notifications[0].body.includes('{{') &&
            written.notifications[0].body.includes('verify-negative'),
          JSON.stringify(written.notifications[0]?.body),
        );
      }
    }

    // --- the other branch: no gate, steps skipped --------------------------
    const positiveRun = await callAction(
      'trigger-workflow-run',
      {
        workflow_id: workflowA.id,
        payload: {
          text: 'Thank you so much, the delivery arrived early and the driver was lovely.',
          customer: 'verify-positive',
        },
      },
      ownerA.token,
    );
    const positiveRunId = positiveRun.json?.workflow_run_id;
    if (positiveRunId) {
      const done = await waitForRun(
        positiveRunId,
        (run) => run.status === 'completed' || run.status === 'failed' || run.status === 'paused',
      );
      const branch = done?.step_runs.find((s) => s.step_type === 'conditional_branch');
      const gate = done?.step_runs.find((s) => s.step_type === 'approval_gate');
      const notifyStep = done?.step_runs.find((s) => s.step_type === 'notify');
      const dbWrite = done?.step_runs.find((s) => s.step_type === 'db_write');

      check(
        'a non-negative classification takes the false path',
        branch?.output?.matched === false,
        `llm=${JSON.stringify(done?.step_runs.find((s) => s.step_type === 'llm_call')?.output?.text)} branch=${JSON.stringify(branch?.output)}`,
      );
      check(
        'the skipped branch is marked skipped, not left pending',
        gate?.status === 'skipped' && notifyStep?.status === 'skipped',
        `gate=${gate?.status} notify=${notifyStep?.status}`,
      );
      check(
        'the run still completes through the db_write step',
        done?.status === 'completed' && dbWrite?.status === 'completed',
        `run=${done?.status} db_write=${dbWrite?.status}`,
      );
    }

    /* ---------------------------------------------------------------- 6 */
    section('6. Retry, quota, and non-manual triggers');

    // --- retry -------------------------------------------------------------
    const retryWorkflow = await adminGql(
      `mutation ($org: uuid!) {
         insert_workflows_one(
           object: {
             org_id: $org
             name: "verify: retry probe"
             description: "Created and removed by scripts/verify.mjs"
             workflow_steps: {
               data: [{
                 position: 1
                 key: "unreachable"
                 type: http_request
                 name: "Unreachable endpoint"
                 retry_limit: 2
                 timeout_ms: 4000
                 config: { url: "https://httpbingo.org/status/503", method: "GET" }
               }]
             }
           }
         ) { id }
       }`,
      { org: orgA.id },
    );
    const retryWorkflowId = retryWorkflow.insert_workflows_one.id;

    const retryRun = await callAction(
      'trigger-workflow-run',
      { workflow_id: retryWorkflowId, payload: {} },
      ownerA.token,
    );
    const retryRunId = retryRun.json?.workflow_run_id;
    if (retryRunId) {
      const failed = await waitForRun(retryRunId, (run) => run.status === 'failed', 60000);
      const step = failed?.step_runs[0];
      check(
        'a failing external call is retried the configured number of times',
        step?.attempt_count === 3,
        `attempt_count=${step?.attempt_count} (expected 3 = 1 try + 2 retries), error=${step?.error}`,
      );
      check(
        'the run is marked failed with the error recorded',
        failed?.status === 'failed' && Boolean(failed?.error),
        `status=${failed?.status} error=${failed?.error}`,
      );
    } else {
      check('retry probe run started', false, JSON.stringify(retryRun.json));
    }

    // --- quota -------------------------------------------------------------
    const quotaOrg = await adminGql(
      `mutation ($user: uuid!) {
         insert_organizations_one(
           object: {
             name: "verify: quota probe"
             slug: "verify-quota-probe"
             quota_limit: 1
             org_members: { data: [{ user_id: $user, role: owner }] }
             workflows: {
               data: [{
                 name: "quota probe"
                 workflow_steps: {
                   data: [{ position: 1, key: "noop", type: conditional_branch, name: "noop", config: { operator: "is_truthy", source: "yes" } }]
                 }
               }]
             }
           }
           on_conflict: { constraint: organizations_slug_key, update_columns: [quota_limit] }
         ) { id workflows { id } }
       }`,
      { user: ownerA.userId },
    );
    const quotaOrgId = quotaOrg.insert_organizations_one.id;
    const quotaWorkflowId = quotaOrg.insert_organizations_one.workflows[0]?.id;

    if (quotaWorkflowId) {
      // Reset usage so the check is meaningful on a re-run.
      await adminGql(
        `mutation ($org: uuid!) {
           update_organizations_by_pk(pk_columns: { id: $org }, _set: { quota_used: 0, quota_limit: 1 }) { id }
           delete_workflow_runs(where: { org_id: { _eq: $org } }) { affected_rows }
         }`,
        { org: quotaOrgId },
      );

      const first = await callAction(
        'trigger-workflow-run',
        { workflow_id: quotaWorkflowId, payload: {} },
        ownerA.token,
      );
      check('the first run inside a 1-run quota is allowed', first.ok, JSON.stringify(first.json));

      if (first.json?.workflow_run_id) {
        await waitForRun(first.json.workflow_run_id, (run) => run.status !== 'running' && run.status !== 'pending', 30000);
      }

      const second = await callAction(
        'trigger-workflow-run',
        { workflow_id: quotaWorkflowId, payload: {} },
        ownerA.token,
      );
      check(
        'the second run is refused with QUOTA_EXCEEDED',
        second.status === 429 && second.json?.extensions?.code === 'QUOTA_EXCEEDED',
        `HTTP ${second.status} ${JSON.stringify(second.json)}`,
      );

      const quotaState = await adminGql(
        `query ($org: uuid!) { organizations_by_pk(id: $org) { quota_used quota_limit } }`,
        { org: quotaOrgId },
      );
      check(
        'quota_used was incremented exactly once by the finished run',
        quotaState.organizations_by_pk.quota_used === 1,
        JSON.stringify(quotaState.organizations_by_pk),
      );
    }

    // --- webhook trigger ---------------------------------------------------
    const webhook = await adminGql(
      `query ($wf: uuid!) {
         workflow_triggers(where: { workflow_id: { _eq: $wf }, type: { _eq: webhook } }, limit: 1) { id secret }
       }`,
      { wf: workflowA.id },
    );
    const trigger = webhook.workflow_triggers[0];

    if (trigger) {
      const wrong = await fetch(`${APP}/api/webhooks/${trigger.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': 'not-the-secret' },
        body: JSON.stringify({ text: 'should not run' }),
      });
      check(
        'the webhook rejects a wrong secret',
        wrong.status === 401,
        `HTTP ${wrong.status}`,
      );

      const right = await fetch(`${APP}/api/webhooks/${trigger.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': trigger.secret },
        body: JSON.stringify({
          text: 'Thanks, everything arrived in perfect condition.',
          customer: 'verify-webhook',
        }),
      });
      const webhookJson = await right.json().catch(() => null);
      check(
        'the webhook starts a run with no user session at all',
        right.status === 202 && Boolean(webhookJson?.workflow_run_id),
        `HTTP ${right.status} ${JSON.stringify(webhookJson)}`,
      );

      if (webhookJson?.workflow_run_id) {
        const run = await waitForRun(
          webhookJson.workflow_run_id,
          (r) => r.status === 'completed' || r.status === 'failed' || r.status === 'paused',
        );
        const record = await adminGql(
          `query ($id: uuid!) { workflow_runs_by_pk(id: $id) { trigger_type triggered_by } }`,
          { id: webhookJson.workflow_run_id },
        );
        check(
          'the webhook run is attributed to the webhook, not to a user',
          record.workflow_runs_by_pk.trigger_type === 'webhook' &&
            record.workflow_runs_by_pk.triggered_by === null,
          JSON.stringify(record.workflow_runs_by_pk),
        );
        check(
          'the webhook run executes to a terminal state',
          run?.status === 'completed' || run?.status === 'paused',
          `status=${run?.status} error=${run?.error}`,
        );
      }
    } else {
      check('webhook trigger exists on the demo workflow', false, 'none found — re-run npm run seed');
    }

    // --- database event trigger -------------------------------------------
    const eventSecret = env('HASURA_WEBHOOK_SECRET');
    if (eventSecret) {
      const inserted = await adminGql(
        `mutation ($org: uuid!) {
           insert_watched_records_one(
             object: { org_id: $org, source_key: "support_ticket", payload: { text: "A row landed in the watched table.", customer: "verify-db-event" } }
           ) { id org_id source_key payload }
         }`,
        { org: orgA.id },
      );
      const row = inserted.insert_watched_records_one;

      // Deliver the same payload Hasura would send, so this proves the handler
      // rather than requiring Hasura to reach localhost.
      const eventRes = await fetch(`${APP}/api/hasura/events/watched-record-created`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hasura-event-secret': eventSecret },
        body: JSON.stringify({ event: { op: 'INSERT', data: { new: row } } }),
      });
      const eventJson = await eventRes.json().catch(() => null);
      check(
        'a row in the watched table starts a run via the Event Trigger handler',
        eventRes.ok && (eventJson?.started ?? []).some((entry) => entry.workflow_run_id),
        `HTTP ${eventRes.status} ${JSON.stringify(eventJson)}`,
      );

      const unauthorizedEvent = await fetch(`${APP}/api/hasura/events/watched-record-created`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: { op: 'INSERT', data: { new: row } } }),
      });
      check(
        'the Event Trigger endpoint rejects requests without the shared secret',
        unauthorizedEvent.status === 401,
        `HTTP ${unauthorizedEvent.status}`,
      );

      // --- scheduled trigger ----------------------------------------------
      const schedule = await adminGql(
        `mutation ($wf: uuid!) {
           update_workflow_triggers(
             where: { workflow_id: { _eq: $wf }, type: { _eq: scheduled } }
             _set: { is_enabled: true, cron_expression: "* * * * *", last_fired_at: null }
           ) { affected_rows returning { id } }
         }`,
        { wf: workflowA.id },
      );

      if (schedule.update_workflow_triggers.affected_rows > 0) {
        const tick = await fetch(`${APP}/api/hasura/events/cron-tick`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hasura-event-secret': eventSecret },
          body: JSON.stringify({}),
        });
        const tickJson = await tick.json().catch(() => null);
        check(
          'the cron tick starts a run for a due schedule',
          tick.ok && (tickJson?.started ?? []).some((entry) => entry.workflow_run_id),
          `HTTP ${tick.status} ${JSON.stringify(tickJson)}`,
        );

        const secondTick = await fetch(`${APP}/api/hasura/events/cron-tick`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hasura-event-secret': eventSecret },
          body: JSON.stringify({}),
        });
        const secondJson = await secondTick.json().catch(() => null);
        check(
          'a second tick in the same minute does not fire the schedule again',
          (secondJson?.started ?? []).length === 0,
          JSON.stringify(secondJson),
        );

        // Leave the schedule off so it does not consume quota after the run.
        await adminGql(
          `mutation ($wf: uuid!) {
             update_workflow_triggers(
               where: { workflow_id: { _eq: $wf }, type: { _eq: scheduled } }
               _set: { is_enabled: false, cron_expression: "*/10 * * * *" }
             ) { affected_rows }
           }`,
          { wf: workflowA.id },
        );
      }
    } else {
      skip('event trigger and cron tests', 'HASURA_WEBHOOK_SECRET is not set locally');
    }

    // Tidy up the probe workflow and org created above.
    await adminGql(
      `mutation ($wf: uuid!, $org: uuid!) {
         delete_workflows_by_pk(id: $wf) { id }
         delete_organizations_by_pk(id: $org) { id }
       }`,
      { wf: retryWorkflowId, org: quotaOrgId },
    );
  }

  /* ------------------------------------------------------------------ 7 */
  section('7. Hasura Action wiring');

  // (a) Hasura's half: the actions exist with the right argument types, and the
  //     role permissions on them are enforced by Hasura before any handler runs.
  const schema = await adminGql(
    `query {
       mutationType: __type(name: "mutation_root") { fields { name args { name type { ofType { name } name } } } }
       queryType: __type(name: "query_root") { fields { name } }
     }`,
  );
  const mutationFields = new Map(schema.mutationType.fields.map((f) => [f.name, f]));
  check(
    'all four run/approval actions are exposed as mutations',
    ['triggerWorkflowRun', 'approveStep', 'rejectStep', 'triggerWorkflowWebhook'].every((name) =>
      mutationFields.has(name),
    ),
    [...mutationFields.keys()].join(', '),
  );
  check(
    'getWebhookEndpoint is exposed as a query action',
    schema.queryType.fields.some((f) => f.name === 'getWebhookEndpoint'),
  );
  check(
    'triggerWorkflowRun takes workflow_id: uuid!',
    (mutationFields.get('triggerWorkflowRun')?.args ?? []).some(
      (arg) => arg.name === 'workflow_id' && arg.type?.ofType?.name === 'uuid',
    ),
    JSON.stringify(mutationFields.get('triggerWorkflowRun')?.args),
  );

  const anonAction = await anonGql(
    `mutation ($wf: uuid!) { triggerWorkflowRun(workflow_id: $wf) { workflow_run_id } }`,
    { wf: workflowA.id },
  );
  check(
    'the unauthorized role cannot even see triggerWorkflowRun (action permission)',
    refused(anonAction) && /not found in type/i.test(errorText(anonAction)),
    errorText(anonAction),
  );

  const anonWebhookAction = await anonGql(
    `mutation ($id: uuid!) { triggerWorkflowWebhook(trigger_id: $id, secret: "wrong") { workflow_run_id } }`,
    { id: '00000000-0000-0000-0000-000000000000' },
  );
  check(
    'the unauthorized role CAN reach triggerWorkflowWebhook, and is refused on the secret',
    refused(anonWebhookAction) && !/not found in type/i.test(errorText(anonWebhookAction)),
    errorText(anonWebhookAction),
  );

  // (b) The handler's half: a request shaped exactly like Hasura's — action
  //     secret plus verified session_variables — is accepted, and the identity
  //     it acts on is the one in session_variables.
  const actionSecret = env('HASURA_ACTION_SECRET');
  if (!reachable) {
    skip('the handler side of the Action protocol', 'the app is not running');
  } else if (!actionSecret) {
    skip('the handler side of the Action protocol', 'HASURA_ACTION_SECRET is not set locally');
  } else {
    async function asHasura(route, input, userId) {
      const res = await fetch(`${APP}/api/hasura/actions/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hasura-action-secret': actionSecret },
        body: JSON.stringify({
          action: { name: route },
          input,
          session_variables: { 'x-hasura-user-id': userId, 'x-hasura-role': 'user' },
        }),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    }

    const trusted = await asHasura(
      'trigger-workflow-run',
      { workflow_id: workflowA.id, payload: { text: 'Great service, thank you!', customer: 'verify-action' } },
      ownerA.userId,
    );
    check(
      'a genuine Hasura-shaped request (action secret + session variables) starts a run',
      trusted.status === 200 && Boolean(trusted.json?.workflow_run_id),
      `HTTP ${trusted.status} ${JSON.stringify(trusted.json)}`,
    );

    const trustedViewer = await asHasura(
      'trigger-workflow-run',
      { workflow_id: workflowA.id, payload: {} },
      viewerA.userId,
    );
    check(
      'the handler authorises the session-variable identity, so a viewer is still refused',
      trustedViewer.status === 403,
      `HTTP ${trustedViewer.status} ${JSON.stringify(trustedViewer.json)}`,
    );

    const trustedOrgB = await asHasura(
      'trigger-workflow-run',
      { workflow_id: workflowA.id, payload: {} },
      ownerB.userId,
    );
    check(
      'and an Org B identity is refused on an Org A workflow',
      trustedOrgB.status === 403 || trustedOrgB.status === 404,
      `HTTP ${trustedOrgB.status} ${JSON.stringify(trustedOrgB.json)}`,
    );
  }

  // (c) The two halves joined over the public internet. Only possible once the
  //     handler is reachable from Hasura's network.
  const publicAppUrl = !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(APP);
  const actionViaHasura = await userGql(
    ownerA.token,
    `mutation ($wf: uuid!) { triggerWorkflowRun(workflow_id: $wf, payload: {}) { workflow_run_id status } }`,
    { wf: workflowA.id },
  );
  if (!publicAppUrl) {
    skip(
      'end-to-end over the Hasura Action',
      `APP_BASE_URL is ${APP}, which Nhost-hosted Hasura cannot reach. Deploy the app, set APP_BASE_URL to the deployment URL, run "npm run hasura:apply", then re-run this script — the check above proves the handler already speaks the protocol correctly.`,
    );
  } else if (refused(actionViaHasura)) {
    check('end-to-end over the Hasura Action', false, errorText(actionViaHasura));
  } else {
    check(
      'end-to-end over the Hasura Action: Hasura calls the deployed handler',
      Boolean(actionViaHasura.data?.triggerWorkflowRun?.workflow_run_id),
      JSON.stringify(actionViaHasura.data),
    );
    const viewerViaHasura = await userGql(
      viewerA.token,
      `mutation ($wf: uuid!) { triggerWorkflowRun(workflow_id: $wf, payload: {}) { workflow_run_id } }`,
      { wf: workflowA.id },
    );
    check(
      'a viewer is refused over the Hasura Action too',
      refused(viewerViaHasura),
      JSON.stringify(viewerViaHasura.data),
    );
  }

  /* --------------------------------------------------------------- summary */
  console.log(`\n${'='.repeat(70)}`);
  console.log(
    `  ${results.pass} passed   ${results.fail} failed   ${results.skip} skipped`,
  );
  console.log('='.repeat(70));
  if (results.failures.length) {
    console.log('\nFailures:');
    for (const failure of results.failures) console.log(`  • ${failure}`);
  }
  console.log('');
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch((err) => {
  log.fail(err.stack ?? err.message);
  process.exit(1);
});
