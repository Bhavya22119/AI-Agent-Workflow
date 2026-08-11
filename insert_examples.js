const fetch = require('node-fetch');

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const GRAPHQL_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql';
const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';

async function adminQuery(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

const workflows = [
  {
    name: "Customer Support Classifier",
    description: "Webhook example: Classifies incoming support tickets and emails the right team.",
    org_id: ORG_ID,
    workflow_triggers: {
      data: [
        { type: "webhook", config: { ui: { id: "trigger", x: 100, y: 150, out_edges: [{ id: "e1-2", source: "trigger", target: "step-2" }] } } }
      ]
    },
    workflow_steps: {
      data: [
        { position: 1, type: "llm_call", config: { prompt: "Classify this message into Sales, Support, or Billing. Just output one word. Message: {{input.message}}", ui: { id: "step-2", x: 400, y: 150, out_edges: [{ id: "e2-3", source: "step-2", target: "step-3" }] } } },
        { position: 2, type: "notify", config: { channel: "email", recipient: "billing-team@example.com", message: "New issue from {{input.name}}: {{input.message}}\n\nClassification: {{prev_output.result}}", ui: { id: "step-3", x: 700, y: 150 } } }
      ]
    }
  },
  {
    name: "Daily Quote",
    description: "Schedule example: Fetches a random quote and translates it every day at 8 AM.",
    org_id: ORG_ID,
    workflow_triggers: {
      data: [
        { type: "schedule", config: { cron_expression: "0 8 * * *", ui: { id: "trigger", x: 100, y: 150, out_edges: [{ id: "e1-2", source: "trigger", target: "step-2" }] } } }
      ]
    },
    workflow_steps: {
      data: [
        { position: 1, type: "http_request", config: { url: "https://api.quotable.io/random", method: "GET", ui: { id: "step-2", x: 400, y: 150, out_edges: [{ id: "e2-3", source: "step-2", target: "step-3" }] } } },
        { position: 2, type: "llm_call", config: { prompt: "Translate this quote into Hindi: {{input.content}}", ui: { id: "step-3", x: 700, y: 150, out_edges: [{ id: "e3-4", source: "step-3", target: "step-4" }] } } },
        { position: 3, type: "notify", config: { channel: "email", recipient: "bhavyaverma22119@gmail.com", message: "Here is your daily quote in Hindi:\n{{input.result}}", ui: { id: "step-4", x: 1000, y: 150 } } }
      ]
    }
  },
  {
    name: "Welcome New Users",
    description: "DB Event example: Drafts a welcome email when a new user is inserted.",
    org_id: ORG_ID,
    workflow_triggers: {
      data: [
        { type: "db_event", config: { ui: { id: "trigger", x: 100, y: 150, out_edges: [{ id: "e1-2", source: "trigger", target: "step-2" }] } } }
      ]
    },
    workflow_steps: {
      data: [
        { position: 1, type: "llm_call", config: { prompt: "Write a short 2-sentence welcome email for {{input.name}}.", ui: { id: "step-2", x: 400, y: 150, out_edges: [{ id: "e2-3", source: "step-2", target: "step-3" }] } } },
        { position: 2, type: "approval_gate", config: { ui: { id: "step-3", x: 700, y: 150, out_edges: [{ id: "e3-4", source: "step-3", target: "step-4" }] } } },
        { position: 3, type: "notify", config: { channel: "email", recipient: "{{input.email}}", message: "{{input.result}}", ui: { id: "step-4", x: 1000, y: 150 } } }
      ]
    }
  }
];

async function run() {
  const query = `
    mutation CreateWorkflows($objects: [workflows_insert_input!]!) {
      insert_workflows(objects: $objects) {
        affected_rows
      }
    }
  `;
  try {
    const data = await adminQuery(query, { objects: workflows });
    console.log("Successfully inserted example workflows:", data);
  } catch (err) {
    console.error(err);
  }
}

run();
