/**
 * The six step executors.
 *
 * Each one receives the rendered run context and returns a StepOutcome. Retries
 * for the two step types that leave the process (llm_call, http_request) are
 * applied here, so attempt_count is accurate and a transient 429 or 503 does not
 * fail a run on the first try.
 */
import { serverEnv } from '../env';
import { loadLlmConnection } from './connections';
import { callLlm, LlmError } from './llm';
import { assertPublicUrl, fetchWithTimeout, UnsafeTargetError } from './net';
import { insertNotification, insertWorkflowOutput } from './store';
import { configString, renderDeep, resolveValue } from './template';
import { withRetry } from './retry';
import type { Json, StepExecutionContext, StepOutcome } from './types';

export class StepConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StepConfigError';
  }
}

/* ------------------------------------------------------------------ llm_call */

async function executeLlmCall(ctx: StepExecutionContext): Promise<StepOutcome> {
  const prompt = configString(ctx.config, 'prompt', ctx.ctx);
  if (!prompt.trim()) {
    throw new StepConfigError('llm_call needs a non-empty `prompt`.');
  }

  // A step may point at one of its organization's own endpoints. The lookup is
  // scoped to this run's org, so a connection id from another tenant resolves to
  // nothing rather than to their API key.
  const connectionId =
    typeof ctx.config.connection_id === 'string' && ctx.config.connection_id.trim()
      ? ctx.config.connection_id.trim()
      : null;

  const connection = connectionId
    ? await loadLlmConnection(ctx.run.org_id, connectionId)
    : null;

  if (connectionId && !connection) {
    throw new StepConfigError(
      'This step uses a saved LLM connection that no longer exists. Pick another one in the node’s Connection field.',
    );
  }

  const result = await withRetry(
    () =>
      callLlm({
        prompt,
        system: ctx.config.system ? configString(ctx.config, 'system', ctx.ctx) : undefined,
        model: typeof ctx.config.model === 'string' && ctx.config.model ? ctx.config.model : undefined,
        provider:
          typeof ctx.config.provider === 'string' && ctx.config.provider
            ? ctx.config.provider
            : undefined,
        ...(connection ? { connection } : {}),
        maxTokens: typeof ctx.config.max_tokens === 'number' ? ctx.config.max_tokens : undefined,
        temperature:
          typeof ctx.config.temperature === 'number' ? ctx.config.temperature : undefined,
        timeoutMs: ctx.step.workflow_step.timeout_ms,
      }),
    {
      retries: ctx.step.workflow_step.retry_limit,
      onAttempt: ctx.onAttempt,
      isRetryable: (error) => !(error instanceof LlmError) || error.retryable,
    },
  );

  return {
    kind: 'output',
    output: {
      text: result.text,
      provider: result.provider,
      model: result.model,
      stubbed: result.stubbed,
      latency_ms: result.latency_ms,
      // Which endpoint answered, so a run's output shows where the text came
      // from — not just that "an LLM" produced it.
      ...(result.endpoint ? { endpoint: result.endpoint } : {}),
      ...(connection?.name ? { connection: connection.name } : {}),
      ...(result.usage ? { usage: result.usage as Json } : {}),
    },
  };
}

/* -------------------------------------------------------------- http_request */

async function executeHttpRequest(ctx: StepExecutionContext): Promise<StepOutcome> {
  const url = configString(ctx.config, 'url', ctx.ctx);
  if (!url.trim()) throw new StepConfigError('http_request needs a `url`.');

  const method = (configString(ctx.config, 'method', ctx.ctx, 'GET') || 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  if (ctx.config.headers && typeof ctx.config.headers === 'object') {
    for (const [key, value] of Object.entries(
      renderDeep(ctx.config.headers as Json, ctx.ctx) as Record<string, Json>,
    )) {
      headers[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }

  let body: string | undefined;
  if (ctx.config.body !== undefined && ctx.config.body !== null && method !== 'GET' && method !== 'HEAD') {
    const rendered =
      typeof ctx.config.body === 'string'
        ? resolveValue(ctx.config.body, ctx.ctx)
        : renderDeep(ctx.config.body as Json, ctx.ctx);
    body = typeof rendered === 'string' ? rendered : JSON.stringify(rendered);
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['content-type'] = 'application/json';
    }
  }

  const target = await assertPublicUrl(url);

  const response = await withRetry(
    async () => {
      const result = await fetchWithTimeout(
        target.toString(),
        { method, headers, body },
        ctx.step.workflow_step.timeout_ms,
      );
      // 4xx is a real answer from the server: retrying will not change it.
      // 429 and 5xx are worth another attempt.
      if (result.status === 429 || result.status >= 500) {
        throw new Error(`Upstream returned ${result.status}`);
      }
      return result;
    },
    {
      retries: ctx.step.workflow_step.retry_limit,
      onAttempt: ctx.onAttempt,
      isRetryable: (error) => !(error instanceof UnsafeTargetError),
    },
  );

  return {
    kind: 'output',
    output: {
      status: response.status,
      ok: response.ok,
      url: target.toString(),
      method,
      body: response.body as Json,
    },
  };
}

/* ------------------------------------------------------------------ db_write */

async function executeDbWrite(ctx: StepExecutionContext): Promise<StepOutcome> {
  const key = configString(ctx.config, 'key', ctx.ctx, 'result') || 'result';
  const value =
    ctx.config.value === undefined
      ? (ctx.ctx.prev ?? null)
      : renderDeep(ctx.config.value as Json, ctx.ctx);

  const id = await insertWorkflowOutput({
    orgId: ctx.run.org_id,
    runId: ctx.run.id,
    stepRunId: ctx.step.id,
    key,
    value: value as Json,
  });

  return { kind: 'output', output: { workflow_output_id: id, key, value: value as Json } };
}

/* -------------------------------------------------------------------- notify */

async function executeNotify(ctx: StepExecutionContext): Promise<StepOutcome> {
  const rawChannel = configString(ctx.config, 'channel', ctx.ctx, 'slack');
  const channel = (['slack', 'email', 'log'] as const).includes(rawChannel as 'slack')
    ? (rawChannel as 'slack' | 'email' | 'log')
    : 'log';

  const body = configString(ctx.config, 'body', ctx.ctx) || configString(ctx.config, 'message', ctx.ctx);
  if (!body.trim()) throw new StepConfigError('notify needs a `body` (or `message`).');

  // The step only records the intent. Delivery is performed by the
  // `notification_created` Hasura Event Trigger, so a flaky Slack endpoint
  // retries on Hasura's schedule instead of failing the workflow run.
  const id = await insertNotification({
    orgId: ctx.run.org_id,
    runId: ctx.run.id,
    stepRunId: ctx.step.id,
    channel,
    target: configString(ctx.config, 'target', ctx.ctx) || null,
    subject: configString(ctx.config, 'subject', ctx.ctx) || null,
    body,
  });

  return {
    kind: 'output',
    output: {
      notification_id: id,
      channel,
      delivery: 'queued to notification_created event trigger',
    },
  };
}

/* -------------------------------------------------------- conditional_branch */

const OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'gt',
  'gte',
  'lt',
  'lte',
  'matches',
  'is_truthy',
  'is_empty',
] as const;

export type BranchOperator = (typeof OPERATORS)[number];

function compare(left: string, operator: BranchOperator, right: string, caseSensitive: boolean): boolean {
  const l = caseSensitive ? left : left.toLowerCase();
  const r = caseSensitive ? right : right.toLowerCase();

  switch (operator) {
    case 'equals':
      return l === r;
    case 'not_equals':
      return l !== r;
    case 'contains':
      return l.includes(r);
    case 'not_contains':
      return !l.includes(r);
    case 'starts_with':
      return l.startsWith(r);
    case 'gt':
      return Number(left) > Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'matches':
      try {
        return new RegExp(right, caseSensitive ? '' : 'i').test(left);
      } catch {
        throw new StepConfigError(`\`value\` is not a valid regular expression: ${right}`);
      }
    case 'is_truthy':
      return Boolean(left) && l !== 'false' && l !== '0' && l !== 'null';
    case 'is_empty':
      return left.trim() === '';
    default:
      throw new StepConfigError(`Unknown operator "${operator}".`);
  }
}

async function executeConditionalBranch(ctx: StepExecutionContext): Promise<StepOutcome> {
  const operator = (configString(ctx.config, 'operator', ctx.ctx, 'contains') ||
    'contains') as BranchOperator;
  if (!OPERATORS.includes(operator)) {
    throw new StepConfigError(
      `Unknown operator "${operator}". Supported: ${OPERATORS.join(', ')}.`,
    );
  }

  // `source` defaults to the previous step's text, which is the common case:
  // "branch on what the LLM just said".
  const sourceTemplate =
    typeof ctx.config.source === 'string' && ctx.config.source.trim()
      ? ctx.config.source
      : '{{prev.text}}';
  const leftRaw = resolveValue(sourceTemplate, ctx.ctx);
  const left = typeof leftRaw === 'string' ? leftRaw : JSON.stringify(leftRaw ?? '');
  const right = configString(ctx.config, 'value', ctx.ctx);
  const caseSensitive = ctx.config.case_sensitive === true;

  const matched = compare(left, operator, right, caseSensitive);
  const handle = matched ? 'true' : 'false';
  const target = ctx.step.workflow_step.next?.[handle];

  return {
    kind: 'branch',
    handle,
    output: {
      matched,
      branch: handle,
      evaluated: { left, operator, right, case_sensitive: caseSensitive },
      // Recorded for the UI: which connection was followed, and whether the
      // canvas actually has anything wired to that output.
      followed: target ?? null,
      ends_run: !target,
    },
  };
}

/* ------------------------------------------------------------ approval_gate */

export const DEFAULT_APPROVER_ROLES = ['owner', 'editor'] as const;

/** Which org roles may clear this gate. Read by the approveStep handler too. */
export function approverRolesFor(config: Record<string, Json>): Array<'owner' | 'editor' | 'viewer'> {
  const raw = config.approver_roles;
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_APPROVER_ROLES];
  const roles = raw
    .map((role) => String(role))
    .filter((role): role is 'owner' | 'editor' | 'viewer' =>
      role === 'owner' || role === 'editor' || role === 'viewer',
    );
  return roles.length ? roles : [...DEFAULT_APPROVER_ROLES];
}

async function executeApprovalGate(ctx: StepExecutionContext): Promise<StepOutcome> {
  const message =
    configString(ctx.config, 'message', ctx.ctx) || 'Waiting for approval to continue.';
  return {
    kind: 'pause',
    output: {
      awaiting_approval: true,
      message,
      approver_roles: approverRolesFor(ctx.config) as unknown as Json,
      paused_at: new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------------------------ dispatch */

export async function executeStep(ctx: StepExecutionContext): Promise<StepOutcome> {
  switch (ctx.step.step_type) {
    case 'llm_call':
      return executeLlmCall(ctx);
    case 'http_request':
      return executeHttpRequest(ctx);
    case 'db_write':
      return executeDbWrite(ctx);
    case 'notify':
      return executeNotify(ctx);
    case 'conditional_branch':
      return executeConditionalBranch(ctx);
    case 'approval_gate':
      return executeApprovalGate(ctx);
    default:
      throw new StepConfigError(`Unsupported step type "${ctx.step.step_type}".`);
  }
}

export { serverEnv as engineEnv };
