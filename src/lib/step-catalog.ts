/**
 * Describes each step and trigger type for the builder UI: labels, defaults, and
 * the fields its config editor renders.
 *
 * `ownerOnly` mirrors Layer 2 exactly (db_write, notify, and the webhook
 * trigger). The UI uses it to disable the option for editors — but that is a
 * courtesy, not the enforcement: the same rule is a Hasura permission check and
 * a handler check, so an editor who bypasses the UI still gets rejected.
 */
import type { Json, OrgRole, StepType, TriggerType } from './types';

export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'json' | 'keyvalue';

export interface StepField {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  min?: number;
  max?: number;
}

export interface StepSpec {
  type: StepType;
  label: string;
  blurb: string;
  ownerOnly: boolean;
  /** Tailwind classes for the step's badge. */
  tone: string;
  defaults: {
    name: string;
    config: Record<string, Json>;
    retry_limit: number;
    timeout_ms: number;
  };
  fields: StepField[];
}

export const TEMPLATE_HELP =
  'Templates: {{prev.text}} (previous step), {{steps.1.output.text}} (a specific step), {{trigger.payload.text}} (the run payload).';

export const STEP_CATALOG: Record<StepType, StepSpec> = {
  llm_call: {
    type: 'llm_call',
    label: 'LLM call',
    blurb: 'Send a prompt to a real language model and capture the answer.',
    ownerOnly: false,
    tone: 'bg-accent-soft text-accent-ink',
    defaults: {
      name: 'Classify with an LLM',
      config: {
        // Blank means "use the server's configured provider". Set to an
        // llm_connections id to call the organization's own endpoint instead.
        connection_id: '',
        model: '',
        prompt:
          'Classify the sentiment of this message as exactly one word — positive, negative or neutral.\n\nMessage: {{trigger.payload.text}}',
        system: 'You answer with a single lowercase word and nothing else.',
        temperature: 0,
        max_tokens: 16,
      },
      retry_limit: 1,
      timeout_ms: 25000,
    },
    // `connection_id` and `model` are not in this list: they are rendered by
    // LlmConnectionField, which has to load the organization's connections and
    // show the endpoint each one resolves to.
    fields: [
      {
        key: 'prompt',
        label: 'Prompt',
        kind: 'textarea',
        rows: 6,
        help: TEMPLATE_HELP,
        placeholder: 'Summarise this: {{prev.text}}',
      },
      { key: 'system', label: 'System instruction', kind: 'textarea', rows: 2 },
      { key: 'temperature', label: 'Temperature', kind: 'number', min: 0, max: 2 },
      { key: 'max_tokens', label: 'Max tokens', kind: 'number', min: 1, max: 4096 },
    ],
  },

  http_request: {
    type: 'http_request',
    label: 'HTTP request',
    blurb: 'Call any external API and pass its response to the next step.',
    ownerOnly: false,
    tone: 'bg-info-soft text-info',
    defaults: {
      name: 'Call an external API',
      config: {
        url: 'https://httpbingo.org/post',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { sentiment: '{{prev.text}}', source: 'ai-agent-workflow' },
      },
      retry_limit: 1,
      timeout_ms: 20000,
    },
    fields: [
      { key: 'url', label: 'URL', kind: 'text', placeholder: 'https://api.example.com/v1/things' },
      {
        key: 'method',
        label: 'Method',
        kind: 'select',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m })),
      },
      { key: 'headers', label: 'Headers', kind: 'keyvalue' },
      { key: 'body', label: 'Body', kind: 'json', rows: 5, help: TEMPLATE_HELP },
    ],
  },

  conditional_branch: {
    type: 'conditional_branch',
    label: 'Condition',
    blurb: "Branch on the previous step's output; wire true and false to different nodes.",
    ownerOnly: false,
    tone: 'bg-warn-soft text-warn',
    defaults: {
      name: 'Route on the result',
      config: {
        source: '{{prev.text}}',
        operator: 'contains',
        value: 'negative',
        case_sensitive: false,
      },
      retry_limit: 0,
      timeout_ms: 5000,
    },
    fields: [
      {
        key: 'source',
        label: 'Value to test',
        kind: 'text',
        placeholder: '{{prev.text}}',
        help: TEMPLATE_HELP,
      },
      {
        key: 'operator',
        label: 'Operator',
        kind: 'select',
        options: [
          { value: 'contains', label: 'contains' },
          { value: 'not_contains', label: 'does not contain' },
          { value: 'equals', label: 'equals' },
          { value: 'not_equals', label: 'does not equal' },
          { value: 'starts_with', label: 'starts with' },
          { value: 'matches', label: 'matches regex' },
          { value: 'gt', label: '>' },
          { value: 'gte', label: '≥' },
          { value: 'lt', label: '<' },
          { value: 'lte', label: '≤' },
          { value: 'is_truthy', label: 'is truthy' },
          { value: 'is_empty', label: 'is empty' },
        ],
      },
      { key: 'value', label: 'Compare with', kind: 'text', placeholder: 'negative' },
    ],
  },

  approval_gate: {
    type: 'approval_gate',
    label: 'Approval gate',
    blurb: 'Pause the run until somebody with the right role approves it.',
    ownerOnly: false,
    tone: 'bg-warn-soft text-warn',
    defaults: {
      name: 'Wait for human approval',
      config: {
        message: 'A human needs to confirm this before the run continues.',
        approver_roles: ['owner', 'editor'],
      },
      retry_limit: 0,
      timeout_ms: 5000,
    },
    fields: [
      { key: 'message', label: 'Message for the approver', kind: 'textarea', rows: 3 },
      {
        key: 'approver_roles',
        label: 'Who can approve',
        kind: 'select',
        options: [
          { value: 'owner,editor', label: 'Owners and editors' },
          { value: 'owner', label: 'Owners only' },
        ],
        help: 'Viewers can never approve, whatever this is set to.',
      },
    ],
  },

  db_write: {
    type: 'db_write',
    label: 'Database write',
    blurb: "Save a result into this app's own workflow_outputs table.",
    ownerOnly: true,
    tone: 'bg-ok-soft text-ok',
    defaults: {
      name: 'Save the result',
      config: { key: 'result', value: '{{prev}}' },
      retry_limit: 0,
      timeout_ms: 10000,
    },
    fields: [
      {
        key: 'key',
        label: 'Key',
        kind: 'text',
        placeholder: 'sentiment',
        help: 'A label for the row, so you can find it later. Rows land in the workflow_outputs table, tagged with this workflow run and scoped to your organization — there is no external database to connect.',
      },
      {
        key: 'value',
        label: 'Value',
        kind: 'json',
        rows: 4,
        help: `What to store: JSON, or a template. ${TEMPLATE_HELP} Saved rows appear under "Database writes" on the run page.`,
      },
    ],
  },

  notify: {
    type: 'notify',
    label: 'Notify',
    blurb: 'Queue a Slack or email alert, delivered by a Hasura Event Trigger.',
    ownerOnly: true,
    tone: 'bg-ok-soft text-ok',
    defaults: {
      name: 'Alert the team',
      config: {
        channel: 'log',
        target: '',
        subject: 'Workflow needs attention',
        body: 'The workflow produced: {{prev.text}}',
      },
      retry_limit: 0,
      timeout_ms: 10000,
    },
    fields: [
      {
        key: 'channel',
        label: 'Channel',
        kind: 'select',
        options: [
          { value: 'log', label: 'Log (no credentials needed)' },
          { value: 'slack', label: 'Slack webhook' },
          { value: 'email', label: 'Email (SMTP)' },
        ],
      },
      {
        key: 'target',
        label: 'Target',
        kind: 'text',
        placeholder: 'Slack webhook URL, or email address',
        help: 'Leave blank for Slack to use the server SLACK_WEBHOOK_URL.',
      },
      { key: 'subject', label: 'Subject', kind: 'text' },
      { key: 'body', label: 'Message', kind: 'textarea', rows: 4, help: TEMPLATE_HELP },
    ],
  },
};

export const STEP_ORDER: StepType[] = [
  'llm_call',
  'http_request',
  'conditional_branch',
  'approval_gate',
  'db_write',
  'notify',
];

export interface TriggerSpec {
  type: TriggerType;
  label: string;
  blurb: string;
  ownerOnly: boolean;
}

export const TRIGGER_CATALOG: Record<TriggerType, TriggerSpec> = {
  manual: {
    type: 'manual',
    label: 'Manual',
    blurb: 'Owners and editors can press Run.',
    ownerOnly: false,
  },
  webhook: {
    type: 'webhook',
    label: 'Webhook',
    blurb: 'An external system starts the run with a secret. Owner-only to create.',
    ownerOnly: true,
  },
  scheduled: {
    type: 'scheduled',
    label: 'Schedule',
    blurb: 'A cron expression, evaluated every minute by a Hasura Cron Trigger.',
    ownerOnly: false,
  },
  database_event: {
    type: 'database_event',
    label: 'Database event',
    blurb: 'A row inserted into watched_records starts the run.',
    ownerOnly: false,
  },
};

export const TRIGGER_ORDER: TriggerType[] = ['manual', 'webhook', 'scheduled', 'database_event'];

/** Layer 2, as the UI sees it. */
export function canUseStepType(type: StepType, role: OrgRole | null): boolean {
  if (!role) return false;
  if (role === 'viewer') return false;
  return STEP_CATALOG[type].ownerOnly ? role === 'owner' : true;
}

export function canUseTriggerType(type: TriggerType, role: OrgRole | null): boolean {
  if (!role) return false;
  if (role === 'viewer') return false;
  return TRIGGER_CATALOG[type].ownerOnly ? role === 'owner' : true;
}

export function canEdit(role: OrgRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

export function canRun(role: OrgRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

export function canManageMembers(role: OrgRole | null): boolean {
  return role === 'owner';
}
