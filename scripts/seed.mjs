#!/usr/bin/env node
/**
 * Seeds the exact scenario the assignment asks to be demonstrated:
 *
 *   Org A "Northwind Support"   owner + editor + viewer
 *   Org B "Contoso Logistics"   a separate owner, its own workflow
 *
 *   Org A's workflow "Support ticket triage":
 *     1 llm_call            classify the inbound message with a real LLM
 *     2 http_request        post the classification to an external API
 *     3 conditional_branch  on the LLM's answer -> gate (negative) or save (else)
 *     4 approval_gate       pauses the run, owner/editor may clear it
 *     5 notify              queued here, delivered by a Hasura Event Trigger
 *     6 db_write            writes the result into workflow_outputs
 *
 *   Triggers: manual + webhook + database_event + scheduled.
 *
 * Idempotent: re-running updates in place rather than duplicating.
 *
 * Users are created through the real Nhost signup endpoint and then marked
 * email-verified with the admin secret, because this project's Nhost instance
 * requires verification and nobody can click a link in a seed script.
 */
import { adminGql, authRequest, log } from './lib/hasura.mjs';
import { getSession } from './lib/session-cache.mjs';

const PASSWORD = 'Password123!';

const PEOPLE = [
  { key: 'ownerA', email: 'owner-a@agentflow.test', name: 'Ada Owner', org: 'A', role: 'owner' },
  { key: 'editorA', email: 'editor-a@agentflow.test', name: 'Evan Editor', org: 'A', role: 'editor' },
  { key: 'viewerA', email: 'viewer-a@agentflow.test', name: 'Vera Viewer', org: 'A', role: 'viewer' },
  { key: 'ownerB', email: 'owner-b@agentflow.test', name: 'Bruno Owner', org: 'B', role: 'owner' },
];

const ORGS = {
  A: { name: 'Northwind Support', slug: 'northwind-support', quota_limit: 100 },
  B: { name: 'Contoso Logistics', slug: 'contoso-logistics', quota_limit: 100 },
};

/* -------------------------------------------------------------------- users */

async function ensureUser(person) {
  // Signup is the only way to get a correctly hashed password; a duplicate email
  // simply fails and we fall through to looking the user up.
  await authRequest('/signup/email-password', {
    email: person.email,
    password: PASSWORD,
    options: { displayName: person.name },
  });

  const found = await adminGql(
    `query FindUser($email: citext!) {
       users(where: { email: { _eq: $email } }, limit: 1) { id email emailVerified displayName }
     }`,
    { email: person.email },
  );
  const user = found.users[0];
  if (!user) {
    throw new Error(
      `Could not create or find ${person.email}. Check that email/password sign-up is enabled on the Nhost project.`,
    );
  }

  if (!user.emailVerified || user.displayName !== person.name) {
    await adminGql(
      `mutation VerifyUser($id: uuid!, $name: String!) {
         updateUser(pk_columns: { id: $id }, _set: { emailVerified: true, displayName: $name }) { id }
       }`,
      { id: user.id, name: person.name },
    );
  }

  // Prove the credentials actually work, so a reviewer is never handed a login
  // that silently fails. Uses the shared session cache, so re-seeding does not
  // burn through Nhost Auth's per-IP sign-in rate limit.
  try {
    await getSession(person.email, PASSWORD);
  } catch (error) {
    // A rate limit is not evidence that the account is broken.
    if (/429/.test(String(error.message))) {
      log.warn(`Could not confirm sign-in for ${person.email} yet: ${error.message.split('\n')[0]}`);
    } else {
      throw error;
    }
  }

  return { ...person, id: user.id };
}

/* --------------------------------------------------------------------- orgs */

async function ensureOrg(spec) {
  const existing = await adminGql(
    `query FindOrg($slug: String!) { organizations(where: { slug: { _eq: $slug } }) { id } }`,
    { slug: spec.slug },
  );

  if (existing.organizations[0]) {
    const id = existing.organizations[0].id;
    await adminGql(
      `mutation UpdateOrg($id: uuid!, $set: organizations_set_input!) {
         update_organizations_by_pk(pk_columns: { id: $id }, _set: $set) { id }
       }`,
      { id, set: { name: spec.name, quota_limit: spec.quota_limit } },
    );
    return id;
  }

  const created = await adminGql(
    `mutation CreateOrg($object: organizations_insert_input!) {
       insert_organizations_one(object: $object) { id }
     }`,
    { object: { name: spec.name, slug: spec.slug, quota_limit: spec.quota_limit } },
  );
  return created.insert_organizations_one.id;
}

/**
 * Clears prior run history and usage for a demo org, so a re-seed produces a
 * reproducible starting point for a walkthrough rather than accumulating runs
 * (and quota) from every previous rehearsal.
 */
async function resetDemoUsage(orgId) {
  const deleted = await adminGql(
    `mutation ResetUsage($orgId: uuid!) {
       delete_workflow_runs(where: { org_id: { _eq: $orgId } }) { affected_rows }
       update_organizations_by_pk(pk_columns: { id: $orgId }, _set: { quota_used: 0 }) { id }
     }`,
    { orgId },
  );
  return deleted.delete_workflow_runs.affected_rows;
}

async function ensureMembership(orgId, userId, role) {
  await adminGql(
    `mutation Upsert($object: org_members_insert_input!) {
       insert_org_members_one(
         object: $object
         on_conflict: { constraint: org_members_org_id_user_id_key, update_columns: [role] }
       ) { id }
     }`,
    { object: { org_id: orgId, user_id: userId, role } },
  );
}

/* ----------------------------------------------------------------- workflow */

/**
 * The demo graph, laid out for the canvas.
 *
 *   classify ──► log_api ──► route ──true──► gate ──► alert ──┐
 *                                    └─false─────────────────►saveee
 *
 * `key` is the stable node id edges point at; `next` maps an output handle to a
 * target key; canvas_x/y is where the node sits.
 */
function triageSteps() {
  return [
    {
      position: 1,
      key: 'classify',
      type: 'llm_call',
      name: 'Classify the message',
      retry_limit: 2,
      timeout_ms: 25000,
      canvas_x: 0,
      canvas_y: 0,
      next: { main: 'log_api' },
      config: {
        system:
          'You are a support triage classifier. Reply with exactly one lowercase word: positive, negative or neutral. No punctuation, no explanation.',
        prompt:
          'Classify the sentiment of this customer message.\n\nMessage: {{trigger.payload.text}}',
        temperature: 0,
        max_tokens: 8,
      },
    },
    {
      position: 2,
      key: 'log_api',
      type: 'http_request',
      name: 'Log to the ticket API',
      retry_limit: 2,
      timeout_ms: 20000,
      canvas_x: 280,
      canvas_y: 0,
      next: { main: 'route' },
      config: {
        url: 'https://httpbingo.org/post',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          sentiment: '{{steps.1.output.text}}',
          customer: '{{trigger.payload.customer}}',
          run_id: '{{run.id}}',
        },
      },
    },
    {
      position: 3,
      key: 'route',
      type: 'conditional_branch',
      name: 'Escalate if negative',
      retry_limit: 0,
      timeout_ms: 5000,
      canvas_x: 560,
      canvas_y: 0,
      // The two outputs go to different nodes: this is the branch the canvas draws.
      next: { true: 'gate', false: 'save_result' },
      config: {
        // Reads step 1 explicitly rather than {{prev}}, because {{prev}} at this
        // point is the HTTP response, not the classification.
        source: '{{steps.1.output.text}}',
        operator: 'contains',
        value: 'negative',
        case_sensitive: false,
      },
    },
    {
      position: 4,
      key: 'gate',
      type: 'approval_gate',
      name: 'Human sign-off to escalate',
      retry_limit: 0,
      timeout_ms: 5000,
      canvas_x: 840,
      canvas_y: -110,
      next: { main: 'alert' },
      config: {
        message:
          'The classifier flagged this ticket as negative. Approve to escalate it and alert the team.',
        approver_roles: ['owner', 'editor'],
      },
    },
    {
      position: 5,
      key: 'alert',
      type: 'notify',
      name: 'Alert the on-call channel',
      retry_limit: 0,
      timeout_ms: 10000,
      canvas_x: 1120,
      canvas_y: -110,
      next: { main: 'save_result' },
      config: {
        channel: 'log',
        subject: 'Escalated support ticket',
        body:
          'Ticket from {{trigger.payload.customer}} was classified {{steps.1.output.text}} and approved for escalation. Message: {{trigger.payload.text}}',
      },
    },
    {
      position: 6,
      key: 'save_result',
      type: 'db_write',
      name: 'Save the triage result',
      retry_limit: 0,
      timeout_ms: 10000,
      canvas_x: 1400,
      canvas_y: 0,
      next: {},
      config: {
        key: 'triage_result',
        value: {
          sentiment: '{{steps.1.output.text}}',
          customer: '{{trigger.payload.customer}}',
          ticket_api_status: '{{steps.2.output.status}}',
          escalated: '{{steps.4.output.approved}}',
        },
      },
    },
  ];
}

function reviewSteps() {
  return [
    {
      position: 1,
      key: 'summarise',
      type: 'llm_call',
      name: 'Summarise the delivery note',
      retry_limit: 1,
      timeout_ms: 25000,
      canvas_x: 0,
      canvas_y: 0,
      next: { main: 'dispatcher' },
      config: {
        prompt: 'Summarise this delivery note in one sentence: {{trigger.payload.text}}',
        temperature: 0.2,
        max_tokens: 80,
      },
    },
    {
      position: 2,
      key: 'dispatcher',
      type: 'approval_gate',
      name: 'Dispatcher sign-off',
      retry_limit: 0,
      timeout_ms: 5000,
      canvas_x: 280,
      canvas_y: 0,
      next: {},
      config: { message: 'Approve this summary before it is filed.', approver_roles: ['owner'] },
    },
  ];
}

async function ensureWorkflow({ orgId, createdBy, name, description, steps, triggers }) {
  const existing = await adminGql(
    `query FindWorkflow($orgId: uuid!, $name: String!) {
       workflows(where: { org_id: { _eq: $orgId }, name: { _eq: $name } }, limit: 1) {
         id
         workflow_triggers { id type }
       }
     }`,
    { orgId, name },
  );

  let workflowId = existing.workflows[0]?.id;

  if (workflowId) {
    await adminGql(
      `mutation ResetWorkflow($id: uuid!, $description: String!) {
         update_workflows_by_pk(
           pk_columns: { id: $id }
           _set: { description: $description, is_active: true }
         ) { id }
         delete_workflow_steps(where: { workflow_id: { _eq: $id } }) { affected_rows }
       }`,
      { id: workflowId, description },
    );
  } else {
    const created = await adminGql(
      `mutation CreateWorkflow($object: workflows_insert_input!) {
         insert_workflows_one(object: $object) { id }
       }`,
      { object: { org_id: orgId, name, description, created_by: createdBy } },
    );
    workflowId = created.insert_workflows_one.id;
  }

  await adminGql(
    `mutation InsertSteps($objects: [workflow_steps_insert_input!]!) {
       insert_workflow_steps(objects: $objects) { affected_rows }
     }`,
    { objects: steps.map((step) => ({ ...step, workflow_id: workflowId })) },
  );

  // Keep existing triggers of the same type so webhook secrets stay stable
  // across re-seeds; add only the types that are missing.
  const presentTypes = new Set((existing.workflows[0]?.workflow_triggers ?? []).map((t) => t.type));
  const missing = triggers.filter((trigger) => !presentTypes.has(trigger.type));
  if (missing.length) {
    await adminGql(
      `mutation InsertTriggers($objects: [workflow_triggers_insert_input!]!) {
         insert_workflow_triggers(objects: $objects) { affected_rows }
       }`,
      { objects: missing.map((trigger) => ({ ...trigger, workflow_id: workflowId, created_by: createdBy })) },
    );
  }

  return workflowId;
}

/* --------------------------------------------------------------------- main */

async function main() {
  log.step('Seeding demo organizations, users and workflows');

  const people = {};
  for (const person of PEOPLE) {
    people[person.key] = await ensureUser(person);
    log.ok(`user ${person.email} (${person.role} of Org ${person.org})`);
  }

  const orgA = await ensureOrg(ORGS.A);
  const orgB = await ensureOrg(ORGS.B);
  log.ok(`Org A ${ORGS.A.name} = ${orgA}`);
  log.ok(`Org B ${ORGS.B.name} = ${orgB}`);

  for (const person of PEOPLE) {
    await ensureMembership(person.org === 'A' ? orgA : orgB, people[person.key].id, person.role);
  }
  log.ok('memberships applied');

  const clearedA = await resetDemoUsage(orgA);
  const clearedB = await resetDemoUsage(orgB);
  log.ok(`cleared ${clearedA + clearedB} previous run(s) and reset quota usage to 0`);

  const triageId = await ensureWorkflow({
    orgId: orgA,
    createdBy: people.ownerA.id,
    name: 'Support ticket triage',
    description:
      'Classify an inbound message with an LLM, log it to an external API, branch on the result, and ask a human before escalating.',
    steps: triageSteps(),
    triggers: [
      { type: 'manual', config: { ui: { x: -300, y: -110 } }, is_enabled: true },
      {
        type: 'webhook',
        config: { note: 'Inbound tickets from the website form', ui: { x: -300, y: -10 } },
        is_enabled: true,
      },
      {
        type: 'database_event',
        config: { source_key: 'support_ticket', ui: { x: -300, y: 90 } },
        is_enabled: true,
      },
      {
        type: 'scheduled',
        config: { timezone: 'UTC', ui: { x: -300, y: 190 } },
        cron_expression: '*/10 * * * *',
        is_enabled: false,
      },
    ],
  });
  log.ok(`Org A workflow "Support ticket triage" = ${triageId}`);

  const reviewId = await ensureWorkflow({
    orgId: orgB,
    createdBy: people.ownerB.id,
    name: 'Delivery note review',
    description: "Org B's own workflow. Org A must not be able to see, run or approve this.",
    steps: reviewSteps(),
    triggers: [{ type: 'manual', config: { ui: { x: -300, y: -10 } }, is_enabled: true }],
  });
  log.ok(`Org B workflow "Delivery note review" = ${reviewId}`);

  const webhook = await adminGql(
    `query WebhookTrigger($workflowId: uuid!) {
       workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: webhook } }, limit: 1) {
         id
         secret
       }
     }`,
    { workflowId: triageId },
  );

  console.log(`
${'='.repeat(78)}
  DEMO CREDENTIALS — password for every account: ${PASSWORD}
${'='.repeat(78)}
  Org A — ${ORGS.A.name}   (${orgA})
    owner    owner-a@agentflow.test    can do everything, including db_write / notify / webhook
    editor   editor-a@agentflow.test   can build and run, cannot add db_write / notify / webhook
    viewer   viewer-a@agentflow.test   read-only, cannot run or approve

  Org B — ${ORGS.B.name}   (${orgB})
    owner    owner-b@agentflow.test    must not see anything above

  Org A workflow : ${triageId}
  Org B workflow : ${reviewId}
${'-'.repeat(78)}
  Webhook trigger : ${webhook.workflow_triggers[0]?.id ?? '(none)'}
  Webhook secret  : ${webhook.workflow_triggers[0]?.secret ?? '(none)'}

  Start a run with no browser at all:
    curl -sS -X POST "$APP_BASE_URL/api/webhooks/${webhook.workflow_triggers[0]?.id}" \\
      -H 'x-webhook-secret: ${webhook.workflow_triggers[0]?.secret}' \\
      -H 'content-type: application/json' \\
      -d '{"text":"Your courier lost my parcel and nobody will help me","customer":"acme"}'
${'='.repeat(78)}
`);
}

main().catch((err) => {
  log.fail(err.message);
  process.exit(1);
});
