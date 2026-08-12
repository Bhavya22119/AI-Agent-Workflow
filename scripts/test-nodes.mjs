#!/usr/bin/env node
/**
 * Node-level test suite: every step type, every branch operator, and the failure
 * paths — against the live project, through the real Action handler.
 *
 *   npm run dev          # in one terminal
 *   npm run test:nodes   # in another
 *
 * Each case builds a throwaway workflow in Org A, triggers it as the org owner,
 * waits for a terminal state, asserts on the resulting step_runs, and deletes the
 * workflow again. Nothing is mocked: llm_call really calls the provider and
 * http_request really calls the network.
 */
import { adminGql, log } from './lib/hasura.mjs';
import { getSession } from './lib/session-cache.mjs';
import { config } from './lib/env.mjs';

const APP = config.appBaseUrl();
const results = { pass: 0, fail: 0, failures: [] };
let group = '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function section(title) {
  group = title;
  console.log(`\n\x1b[1m\x1b[36m── ${title}\x1b[0m`);
}

function check(name, ok, detail = '') {
  if (ok) {
    results.pass += 1;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    results.fail += 1;
    results.failures.push(`[${group}] ${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

let owner;
let editor;
let orgId;

/** Builds a throwaway workflow from a list of step definitions. */
async function createWorkflow(name, steps) {
  const data = await adminGql(
    `mutation ($object: workflows_insert_input!) {
       insert_workflows_one(object: $object) { id }
     }`,
    {
      object: {
        org_id: orgId,
        name: `test: ${name}`,
        description: 'Created and removed by scripts/test-nodes.mjs',
        workflow_steps: {
          data: steps.map((step, index) => ({
            position: index + 1,
            key: step.key,
            type: step.type,
            name: step.name ?? step.key,
            config: step.config ?? {},
            next: step.next ?? {},
            retry_limit: step.retry_limit ?? 0,
            timeout_ms: step.timeout_ms ?? 20000,
            canvas_x: index * 260,
            canvas_y: 0,
          })),
        },
      },
    },
  );
  return data.insert_workflows_one.id;
}

async function deleteWorkflow(id) {
  await adminGql(`mutation ($id: uuid!) { delete_workflows_by_pk(id: $id) { id } }`, { id });
}

async function trigger(workflowId, payload, token = owner.token) {
  const res = await fetch(`${APP}/api/hasura/actions/trigger-workflow-run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: { name: 'triggerWorkflowRun' },
      input: { workflow_id: workflowId, payload },
    }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const RESTING = ['completed', 'failed', 'paused', 'cancelled'];
const FINISHED = ['completed', 'failed', 'cancelled'];

/**
 * Polls until the run reaches one of `wanted`.
 *
 * The distinction matters after an approval: `paused` is a resting state, so
 * waiting for "any resting state" would return instantly with the pre-approval
 * status and miss the resume entirely.
 */
async function waitForRun(runId, wanted = RESTING, timeoutMs = 90000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const data = await adminGql(
      `query ($id: uuid!) {
         workflow_runs_by_pk(id: $id) {
           status error
           step_runs(order_by: { position: asc }) {
             id position step_type status attempt_count error output input
           }
         }
       }`,
      { id: runId },
    );
    last = data.workflow_runs_by_pk;
    if (last && wanted.includes(last.status)) return last;
    await sleep(900);
  }
  return last;
}

/** Build → run → assert → clean up. Returns the terminal run. */
async function runCase(name, steps, payload = {}, assertBeforeCleanup) {
  const workflowId = await createWorkflow(name, steps);
  try {
    const started = await trigger(workflowId, payload);
    if (!started.json?.workflow_run_id) {
      return { failedToStart: true, started, step: () => undefined, step_runs: [] };
    }
    const run = await waitForRun(started.json.workflow_run_id);
    const result = {
      ...run,
      runId: started.json.workflow_run_id,
      step: (key) => run?.step_runs?.find((s) => s.step_type === key),
      at: (position) => run?.step_runs?.find((s) => s.position === position),
    };
    // Rows written by the run live behind a cascade from the workflow, so any
    // assertion about them has to happen before cleanup.
    if (assertBeforeCleanup) await assertBeforeCleanup(result);
    return result;
  } finally {
    await deleteWorkflow(workflowId);
  }
}

/**
 * Runs a case, and retries it once if `expectation` is not met.
 *
 * Only used for cases that depend on a shared public echo service (httpbin),
 * which rate-limits under a burst. Retrying keeps the suite honest about our own
 * behaviour rather than failing on somebody else's capacity.
 */
async function runFlakyCase(name, steps, payload, expectation) {
  let result = await runCase(name, steps, payload);
  if (!expectation(result)) {
    await sleep(3000);
    result = await runCase(`${name} (retry)`, steps, payload);
  }
  return result;
}

/* ========================================================================= */

async function main() {
  console.log(`\nNode test suite against ${config.subdomain}.${config.region}`);
  console.log(`App: ${APP}\n`);

  owner = await getSession('owner-a@agentflow.test', 'Password123!');
  editor = await getSession('editor-a@agentflow.test', 'Password123!');

  const orgs = await adminGql(
    `query { organizations(where: { slug: { _eq: "northwind-support" } }) { id quota_limit quota_used } }`,
  );
  const org = orgs.organizations[0];
  orgId = org?.id;
  if (!orgId) throw new Error('Org A is missing — run "npm run seed" first.');

  // The suite performs dozens of real runs, so give it headroom and put the
  // organization back exactly as it was afterwards — otherwise running the tests
  // would quietly eat the demo workspace's quota.
  const restoreQuota = { quota_limit: org.quota_limit, quota_used: org.quota_used };
  await adminGql(
    `mutation ($id: uuid!) { update_organizations_by_pk(pk_columns: {id: $id}, _set: {quota_limit: 500}) { id } }`,
    { id: orgId },
  );

  /* ------------------------------------------------------------ llm_call */
  section('llm_call');
  {
    const run = await runCase(
      'llm happy path',
      [
        {
          key: 'llm',
          type: 'llm_call',
          retry_limit: 1,
          config: {
            system: 'Reply with exactly one lowercase word: positive, negative or neutral.',
            prompt: 'Classify: {{trigger.payload.text}}',
            temperature: 0,
            max_tokens: 8,
          },
        },
      ],
      { text: 'This is the best support experience I have ever had, thank you!' },
    );
    const step = run.step('llm_call');
    check('calls a real provider and returns text', step?.status === 'completed' && typeof step.output?.text === 'string', JSON.stringify(step?.output ?? step?.error));
    check('records which provider answered', Boolean(step?.output?.provider), JSON.stringify(step?.output));
    check('interpolates the trigger payload into the prompt', String(step?.input?.prompt ?? '').includes('best support experience'), JSON.stringify(step?.input?.prompt));
    check('classifies a clearly positive message as positive', String(step?.output?.text ?? '').toLowerCase().includes('positive'), `got "${step?.output?.text}"`);
  }
  {
    const run = await runCase('llm stub', [
      { key: 'llm', type: 'llm_call', config: { provider: 'stub', prompt: 'This is terrible, I want a refund' } },
    ]);
    const step = run.step('llm_call');
    check('the stub provider is used when asked, and says so', step?.status === 'completed' && step.output?.stubbed === true, JSON.stringify(step?.output));
  }
  {
    const run = await runCase('llm no prompt', [
      { key: 'llm', type: 'llm_call', config: { prompt: '   ' } },
    ]);
    const step = run.step('llm_call');
    check('an empty prompt fails as a configuration error', step?.status === 'failed' && /Configuration error/i.test(step.error ?? ''), step?.error ?? 'no error recorded');
    check('the run is marked failed with the step named', run.status === 'failed' && /llm/i.test(run.error ?? ''), run.error ?? '');
  }

  /* -------------------------------------------------------- http_request */
  section('http_request');
  {
    const run = await runCase('http get', [
      { key: 'get', type: 'http_request', config: { url: 'https://httpbingo.org/get', method: 'GET' } },
    ]);
    const step = run.step('http_request');
    check('GET 200 completes with the parsed body', step?.status === 'completed' && step.output?.status === 200, JSON.stringify(step?.error ?? step?.output?.status));
  }
  {
    const run = await runFlakyCase(
      'http post templated',
      [
        {
          key: 'post',
          type: 'http_request',
          retry_limit: 2,
          config: {
            url: 'https://httpbingo.org/post',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: { who: '{{trigger.payload.customer}}', run: '{{run.id}}' },
          },
        },
      ],
      { customer: 'acme-test' },
      (result) => result.step('http_request')?.output?.body?.json?.who === 'acme-test',
    );
    const step = run.step('http_request');
    const echoed = step?.output?.body?.json;
    check('POST sends a templated JSON body the server echoes back', echoed?.who === 'acme-test', JSON.stringify(echoed));
    check('{{run.id}} resolves to the real run id', echoed?.run === run.runId, `${echoed?.run} vs ${run.runId}`);
  }
  {
    const run = await runCase('http 404', [
      { key: 'notfound', type: 'http_request', retry_limit: 2, config: { url: 'https://httpbingo.org/status/404', method: 'GET' } },
    ]);
    const step = run.step('http_request');
    check('a 404 is a real answer: completes, and is NOT retried', step?.status === 'completed' && step.output?.status === 404 && step.attempt_count === 1, `status=${step?.status} code=${step?.output?.status} attempts=${step?.attempt_count}`);
  }
  {
    const run = await runCase('http 503', [
      { key: 'flaky', type: 'http_request', retry_limit: 2, timeout_ms: 8000, config: { url: 'https://httpbingo.org/status/503', method: 'GET' } },
    ]);
    const step = run.step('http_request');
    check('a 503 is retried retry_limit times, then fails', step?.status === 'failed' && step.attempt_count === 3, `attempts=${step?.attempt_count} status=${step?.status}`);
  }
  {
    const run = await runCase('http ssrf', [
      { key: 'ssrf', type: 'http_request', retry_limit: 2, config: { url: 'http://127.0.0.1:3000/api/hasura/events/cron-tick', method: 'GET' } },
    ]);
    const step = run.step('http_request');
    check('a loopback target is refused by the SSRF guard', step?.status === 'failed' && /private or reserved/i.test(step.error ?? ''), step?.error ?? '');
    check('an SSRF refusal never even attempts the request', step?.attempt_count === 0, `attempts=${step?.attempt_count}`);
  }
  {
    const run = await runCase('http timeout', [
      { key: 'slow', type: 'http_request', retry_limit: 0, timeout_ms: 2000, config: { url: 'https://httpbingo.org/delay/10', method: 'GET' } },
    ]);
    const step = run.step('http_request');
    check('a request past its timeout fails rather than hanging', step?.status === 'failed', `status=${step?.status} error=${step?.error}`);
  }
  {
    const run = await runCase('http bad url', [
      { key: 'bad', type: 'http_request', config: { url: 'notaurl', method: 'GET' } },
    ]);
    const step = run.step('http_request');
    check('a malformed URL fails with a clear message', step?.status === 'failed' && /valid absolute URL/i.test(step.error ?? ''), step?.error ?? '');
  }

  /* --------------------------------------------------- conditional_branch */
  section('conditional_branch');

  const OPERATOR_CASES = [
    { operator: 'equals', source: 'yes', value: 'yes', expect: true },
    { operator: 'equals', source: 'yes', value: 'no', expect: false },
    { operator: 'not_equals', source: 'yes', value: 'no', expect: true },
    { operator: 'contains', source: 'very negative tone', value: 'negative', expect: true },
    { operator: 'not_contains', source: 'all good', value: 'negative', expect: true },
    { operator: 'starts_with', source: 'urgent: help', value: 'urgent', expect: true },
    { operator: 'matches', source: 'ticket-4821', value: '^ticket-\\d+$', expect: true },
    { operator: 'gt', source: '10', value: '5', expect: true },
    { operator: 'gte', source: '5', value: '5', expect: true },
    { operator: 'lt', source: '2', value: '5', expect: true },
    { operator: 'lte', source: '5', value: '5', expect: true },
    { operator: 'is_truthy', source: 'something', value: '', expect: true },
    { operator: 'is_truthy', source: 'false', value: '', expect: false },
    { operator: 'is_empty', source: '  ', value: '', expect: true },
  ];

  for (const testCase of OPERATOR_CASES) {
    const run = await runCase(`branch ${testCase.operator} ${testCase.expect}`, [
      {
        key: 'branch',
        type: 'conditional_branch',
        config: {
          source: testCase.source,
          operator: testCase.operator,
          value: testCase.value,
          case_sensitive: false,
        },
        next: { true: 'on_true', false: 'on_false' },
      },
      { key: 'on_true', type: 'db_write', config: { key: 'took', value: 'true' } },
      { key: 'on_false', type: 'db_write', config: { key: 'took', value: 'false' } },
    ]);
    const branch = run.step('conditional_branch');
    const taken = run.step_runs.filter((s) => s.step_type === 'db_write');
    const trueStep = taken.find((s) => s.position === 2);
    const falseStep = taken.find((s) => s.position === 3);
    const followed = testCase.expect ? trueStep : falseStep;
    const skipped = testCase.expect ? falseStep : trueStep;

    check(
      `${testCase.operator}("${testCase.source}", "${testCase.value}") → ${testCase.expect}`,
      branch?.output?.matched === testCase.expect &&
        followed?.status === 'completed' &&
        skipped?.status === 'skipped',
      `matched=${branch?.output?.matched} followed=${followed?.status} skipped=${skipped?.status}`,
    );
  }

  {
    const run = await runCase('branch unknown operator', [
      { key: 'branch', type: 'conditional_branch', config: { source: 'x', operator: 'wat', value: 'y' } },
    ]);
    const step = run.step('conditional_branch');
    check('an unknown operator is a configuration error', step?.status === 'failed' && /Unknown operator/i.test(step.error ?? ''), step?.error ?? '');
  }
  {
    const run = await runCase('branch open output', [
      { key: 'branch', type: 'conditional_branch', config: { source: 'no', operator: 'equals', value: 'yes' }, next: { true: 'only' } },
      { key: 'only', type: 'db_write', config: { key: 'x', value: '1' } },
    ]);
    check('an output with nothing wired to it simply ends that path', run.status === 'completed', `${run.status} ${run.error ?? ''}`);
    check('the unreached node is recorded as skipped', run.at(2)?.status === 'skipped', run.at(2)?.status);
  }

  /* ------------------------------------------------------- approval_gate */
  section('approval_gate');
  {
    const workflowId = await createWorkflow('gate approve', [
      { key: 'gate', type: 'approval_gate', config: { message: 'ok?', approver_roles: ['owner', 'editor'] }, next: { main: 'after' } },
      { key: 'after', type: 'db_write', config: { key: 'after_gate', value: 'yes' } },
    ]);
    try {
      const started = await trigger(workflowId, {});
      const paused = await waitForRun(started.json.workflow_run_id, ['paused']);
      const gate = paused.step_runs.find((s) => s.step_type === 'approval_gate');
      check('reaching a gate pauses the run', paused.status === 'paused' && gate.status === 'paused', `${paused.status}/${gate?.status}`);
      check('the step after the gate has not run yet', paused.step_runs[1].status === 'pending', paused.step_runs[1].status);

      const approve = await fetch(`${APP}/api/hasura/actions/approve-step`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${editor.token}` },
        body: JSON.stringify({ action: { name: 'approveStep' }, input: { step_run_id: gate.id, note: 'node suite' } }),
      });
      check('an editor may clear an owner+editor gate', approve.ok, `HTTP ${approve.status}`);

      const done = await waitForRun(started.json.workflow_run_id, FINISHED);
      check('the run resumes and completes', done.status === 'completed', `${done.status} ${done.error ?? ''}`);
      check('the step after the gate ran', done.step_runs[1].status === 'completed', done.step_runs[1].status);
      check('the note is recorded on the gate', done.step_runs[0].output?.note === 'node suite', JSON.stringify(done.step_runs[0].output));
    } finally {
      await deleteWorkflow(workflowId);
    }
  }
  {
    const workflowId = await createWorkflow('gate owner only', [
      { key: 'gate', type: 'approval_gate', config: { message: 'owners only', approver_roles: ['owner'] } },
    ]);
    try {
      const started = await trigger(workflowId, {});
      const paused = await waitForRun(started.json.workflow_run_id, ['paused']);
      const gate = paused.step_runs[0];

      const asEditor = await fetch(`${APP}/api/hasura/actions/approve-step`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${editor.token}` },
        body: JSON.stringify({ action: { name: 'approveStep' }, input: { step_run_id: gate.id } }),
      });
      check('an owner-only gate refuses an editor', asEditor.status === 403, `HTTP ${asEditor.status}`);

      const asOwner = await fetch(`${APP}/api/hasura/actions/approve-step`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.token}` },
        body: JSON.stringify({ action: { name: 'approveStep' }, input: { step_run_id: gate.id } }),
      });
      check('…and accepts the owner', asOwner.ok, `HTTP ${asOwner.status}`);
    } finally {
      await deleteWorkflow(workflowId);
    }
  }
  {
    const workflowId = await createWorkflow('gate reject', [
      { key: 'gate', type: 'approval_gate', config: { message: 'no?' }, next: { main: 'after' } },
      { key: 'after', type: 'db_write', config: { key: 'after', value: '1' } },
    ]);
    try {
      const started = await trigger(workflowId, {});
      const paused = await waitForRun(started.json.workflow_run_id, ['paused']);
      const gate = paused.step_runs[0];

      const reject = await fetch(`${APP}/api/hasura/actions/reject-step`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.token}` },
        body: JSON.stringify({ action: { name: 'rejectStep' }, input: { step_run_id: gate.id, note: 'not this time' } }),
      });
      const body = await reject.json().catch(() => null);
      check('rejecting a gate cancels the run', reject.ok && body?.run_status === 'cancelled', `HTTP ${reject.status} ${JSON.stringify(body)}`);

      const done = await waitForRun(started.json.workflow_run_id, FINISHED);
      check('the rejected gate is failed and the rest skipped', done.step_runs[0].status === 'failed' && done.step_runs[1].status === 'skipped', `${done.step_runs[0].status}/${done.step_runs[1].status}`);
      check('the rejection reason is recorded', /not this time/.test(done.error ?? ''), done.error ?? '');
    } finally {
      await deleteWorkflow(workflowId);
    }
  }

  /* ------------------------------------------------------------ db_write */
  section('db_write');
  {
    const run = await runCase(
      'db_write templated',
      [
        { key: 'llm', type: 'llm_call', config: { provider: 'stub', prompt: 'terrible service' }, next: { main: 'save' } },
        { key: 'save', type: 'db_write', config: { key: 'verdict', value: { sentiment: '{{steps.1.output.text}}', who: '{{trigger.payload.customer}}' } } },
      ],
      { customer: 'node-suite' },
      async (result) => {
        const rows = await adminGql(
          `query ($id: uuid!) { workflow_outputs(where: { workflow_run_id: { _eq: $id } }) { key value } }`,
          { id: result.runId },
        );
        check('the row really is in workflow_outputs', rows.workflow_outputs.length === 1 && rows.workflow_outputs[0].key === 'verdict', JSON.stringify(rows.workflow_outputs));
      },
    );
    const step = run.step('db_write');
    check('writes a row and returns its id', step?.status === 'completed' && Boolean(step.output?.workflow_output_id), JSON.stringify(step?.output));
    check('the stored value is interpolated from earlier steps', step?.output?.value?.who === 'node-suite' && typeof step?.output?.value?.sentiment === 'string', JSON.stringify(step?.output?.value));
  }
  {
    const run = await runCase('db_write default value', [
      { key: 'llm', type: 'llm_call', config: { provider: 'stub', prompt: 'hello' }, next: { main: 'save' } },
      { key: 'save', type: 'db_write', config: {} },
    ]);
    const step = run.step('db_write');
    check('with no config it stores the previous output under "result"', step?.status === 'completed' && step.output?.key === 'result', JSON.stringify(step?.output));
  }

  /* -------------------------------------------------------------- notify */
  section('notify');
  {
    const run = await runCase(
      'notify log',
      [{ key: 'note', type: 'notify', config: { channel: 'log', subject: 'Heads up', body: 'Ticket from {{trigger.payload.customer}}' } }],
      { customer: 'node-suite' },
      async (result) => {
        const rows = await adminGql(
          `query ($id: uuid!) { notifications(where: { workflow_run_id: { _eq: $id } }) { channel body status } }`,
          { id: result.runId },
        );
        check('the notification row exists with an interpolated body', rows.notifications[0]?.body === 'Ticket from node-suite', JSON.stringify(rows.notifications));
        check('delivery is left to the Event Trigger, not done inline', rows.notifications[0]?.status === 'pending', rows.notifications[0]?.status);
      },
    );
    const step = run.step('notify');
    check('queues a notification and completes immediately', step?.status === 'completed' && Boolean(step.output?.notification_id), JSON.stringify(step?.output ?? step?.error));
  }
  {
    const run = await runCase('notify empty body', [
      { key: 'note', type: 'notify', config: { channel: 'log', body: '' } },
    ]);
    const step = run.step('notify');
    check('an empty body is a configuration error', step?.status === 'failed' && /Configuration error/i.test(step.error ?? ''), step?.error ?? '');
  }

  /* ------------------------------------------------------- graph shapes */
  section('graph integrity');
  {
    const run = await runCase('dangling edge', [
      { key: 'only_node', type: 'db_write', config: { key: 'a', value: '1' }, next: { main: 'ghost_node' } },
    ]);
    check('an edge to a node that does not exist fails loudly', run.status === 'failed' && /not part of this workflow/i.test(run.error ?? ''), run.error ?? '');
  }
  {
    const run = await runCase('cycle', [
      { key: 'node_a', type: 'db_write', config: { key: 'a', value: '1' }, next: { main: 'node_b' } },
      { key: 'node_b', type: 'db_write', config: { key: 'b', value: '2' }, next: { main: 'node_a' } },
    ]);
    check('a cycle is refused rather than spinning', run.status === 'failed' && /loop/i.test(run.error ?? ''), run.error ?? '');
  }
  {
    const run = await runFlakyCase(
      'four node chain',
      [
        { key: 'one', type: 'llm_call', config: { provider: 'stub', prompt: 'love this' }, next: { main: 'two' } },
        { key: 'two', type: 'http_request', retry_limit: 2, config: { url: 'https://httpbingo.org/post', method: 'POST', body: { got: '{{prev.text}}' } }, next: { main: 'three' } },
        { key: 'three', type: 'conditional_branch', config: { source: '{{steps.2.output.status}}', operator: 'equals', value: '200' }, next: { true: 'four' } },
        { key: 'four', type: 'db_write', config: { key: 'chain', value: { llm: '{{steps.1.output.text}}', http: '{{steps.2.output.status}}' } } },
      ],
      {},
      (result) => Number(result.at(4)?.output?.value?.http) === 200,
    );
    check(
      'a four-node chain passes output down the whole graph',
      run.status === 'completed' && Number(run.at(4)?.output?.value?.http) === 200,
      `${run.status} ${JSON.stringify(run.at(4)?.output?.value)}`,
    );
    check(
      'a whole-placeholder keeps the value type (number stays a number)',
      typeof run.at(4)?.output?.value?.http === 'number',
      `typeof = ${typeof run.at(4)?.output?.value?.http}`,
    );
    check('{{prev}} refers to the immediately preceding step', run.at(2)?.output?.body?.json?.got?.length > 0, JSON.stringify(run.at(2)?.output?.body?.json));
  }
  {
    const run = await runCase('entry detection', [
      // Deliberately listed out of order: `first` is the entry because nothing
      // points at it, not because it is first in the list.
      { key: 'second', type: 'db_write', config: { key: 'second', value: '2' } },
      { key: 'first', type: 'db_write', config: { key: 'first', value: '1' }, next: { main: 'second' } },
    ]);
    const entry = run.step_runs.find((s) => s.position === 2);
    const follower = run.step_runs.find((s) => s.position === 1);
    check(
      'execution starts at the node nothing points at, not at position 1',
      run.status === 'completed' && entry?.status === 'completed' && follower?.status === 'completed',
      `run=${run.status} entry(pos2)=${entry?.status} follower(pos1)=${follower?.status}`,
    );
  }

  /* --------------------------------------------------------------- done */
  await adminGql(
    `mutation ($id: uuid!, $set: organizations_set_input!) {
       update_organizations_by_pk(pk_columns: { id: $id }, _set: $set) { id }
     }`,
    { id: orgId, set: restoreQuota },
  );

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${results.pass} passed   ${results.fail} failed`);
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
