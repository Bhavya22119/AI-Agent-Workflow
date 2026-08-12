/**
 * Calling Hasura Actions from the browser.
 *
 * ============================================================================
 *  Two transports, one code path on the server
 * ============================================================================
 *  `hasura`  (default, and what the deployed app uses)
 *      The client sends a normal GraphQL mutation. Hasura authenticates the JWT,
 *      applies the action's role permission, and forwards the verified session
 *      to the handler. This is the real thing the assignment asks for.
 *
 *  `direct`
 *      The client POSTs to the handler route with its access token. The handler
 *      verifies that token with Nhost Auth and derives the identity from it.
 *
 *  The reason `direct` exists: Hasura runs in Nhost's cloud, so it cannot reach
 *  a handler on http://localhost:3000. Before you have deployed (or started a
 *  tunnel), the `hasura` transport would fail with a connection error for
 *  reasons that have nothing to do with your code. Set
 *  NEXT_PUBLIC_ACTION_TRANSPORT=direct to develop, and leave it unset in
 *  production.
 *
 *  Both transports land in the same handler and are subject to the same
 *  authorization: neither one trusts a caller-supplied user id. `direct` is a
 *  different way to prove who you are, not a way to skip proving it.
 *
 * ============================================================================
 *  Automatic failover
 * ============================================================================
 *  The handler URL Hasura calls is fixed when metadata is applied. Deploy the app
 *  somewhere new and forget to re-apply it, and Hasura answers every Action with
 *  "http exception when calling webhook" — the app looks broken while nothing
 *  about the app is wrong. Panels that fetch through an Action simply go blank.
 *
 *  So the first such failure switches this module to the direct transport for the
 *  rest of the session and retries. The request still gets authenticated (by the
 *  same handler, against Nhost Auth), so nothing is weakened — but the symptom
 *  becomes a banner telling you to re-run `npm run hasura:apply` instead of a
 *  dead UI. `transportNotice()` reports it so that banner can exist.
 */
import { freshAccessToken, gqlRequest, GraphQLError } from './graphql-client';
import type { Json } from './types';

export type ActionTransport = 'hasura' | 'direct';

export const actionTransport: ActionTransport =
  process.env.NEXT_PUBLIC_ACTION_TRANSPORT === 'direct' ? 'direct' : 'hasura';

export class ActionCallError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ActionCallError';
  }
}

interface ActionSpec {
  /** Route segment of the handler, for the `direct` transport. */
  route: string;
  /** GraphQL field name, for the `hasura` transport. */
  field: string;
  document: string;
}

export const ACTIONS = {
  triggerWorkflowRun: {
    route: 'trigger-workflow-run',
    field: 'triggerWorkflowRun',
    document: /* GraphQL */ `
      mutation TriggerWorkflowRun($workflow_id: uuid!, $payload: jsonb) {
        triggerWorkflowRun(workflow_id: $workflow_id, payload: $payload) {
          workflow_run_id
          workflow_id
          status
          step_count
        }
      }
    `,
  },
  approveStep: {
    route: 'approve-step',
    field: 'approveStep',
    document: /* GraphQL */ `
      mutation ApproveStep($step_run_id: uuid!, $note: String) {
        approveStep(step_run_id: $step_run_id, note: $note) {
          step_run_id
          workflow_run_id
          decision
          run_status
        }
      }
    `,
  },
  rejectStep: {
    route: 'reject-step',
    field: 'rejectStep',
    document: /* GraphQL */ `
      mutation RejectStep($step_run_id: uuid!, $note: String) {
        rejectStep(step_run_id: $step_run_id, note: $note) {
          step_run_id
          workflow_run_id
          decision
          run_status
        }
      }
    `,
  },
  createOrganization: {
    route: 'create-organization',
    field: 'createOrganization',
    document: /* GraphQL */ `
      mutation CreateOrganization($name: String!) {
        createOrganization(name: $name) {
          org_id
          name
          slug
          role
        }
      }
    `,
  },
  upsertOrgMember: {
    route: 'upsert-org-member',
    field: 'upsertOrgMember',
    document: /* GraphQL */ `
      mutation UpsertOrgMember($org_id: uuid!, $email: String!, $role: String!) {
        upsertOrgMember(org_id: $org_id, email: $email, role: $role) {
          org_member_id
          user_id
          email
          role
        }
      }
    `,
  },
  getWebhookEndpoint: {
    route: 'get-webhook-endpoint',
    field: 'getWebhookEndpoint',
    document: /* GraphQL */ `
      query GetWebhookEndpoint($trigger_id: uuid!) {
        getWebhookEndpoint(trigger_id: $trigger_id) {
          trigger_id
          graphql_endpoint
          rest_endpoint
          secret
          sample_curl
        }
      }
    `,
  },
  rotateWebhookSecret: {
    route: 'rotate-webhook-secret',
    field: 'rotateWebhookSecret',
    document: /* GraphQL */ `
      mutation RotateWebhookSecret($trigger_id: uuid!) {
        rotateWebhookSecret(trigger_id: $trigger_id) {
          trigger_id
          rest_endpoint
          secret
        }
      }
    `,
  },
} satisfies Record<string, ActionSpec>;

export type ActionName = keyof typeof ACTIONS;

async function callViaHasura<T>(
  spec: ActionSpec,
  variables: Record<string, Json | undefined>,
): Promise<T> {
  try {
    const data = await gqlRequest<Record<string, T>>(spec.document, variables);
    const value = data[spec.field];
    if (value === undefined || value === null) {
      throw new ActionCallError('The action returned no result.');
    }
    return value;
  } catch (error) {
    if (error instanceof GraphQLError) {
      if (isUnreachable(error.message)) {
        throw new ActionCallError(HANDLER_UNREACHABLE_MESSAGE, 'HANDLER_UNREACHABLE');
      }
      throw new ActionCallError(error.message, error.code);
    }
    throw error;
  }
}

/**
 * Hasura's wordings for "I never got a usable answer from the handler". These are
 * transport failures rather than rejections, so they are the errors worth retrying
 * a different way.
 *
 * `not a valid json response from webhook` belongs here even though it sounds like
 * a bug in the handler: it means Hasura reached *something* and got HTML back —
 * a parked domain, a redirect body, a platform 404, a deploy mid-flight. In other
 * words it reached the wrong thing, which is the same class of problem as reaching
 * nothing, and shows up whenever the configured URL is not (yet) the app.
 */
function isUnreachable(message: string): boolean {
  return /http exception|could not connect|connection error|ConnectionError|ECONNREFUSED|timeout|unexpected|not a valid json response/i.test(
    message,
  );
}

const HANDLER_UNREACHABLE_MESSAGE =
  'Hasura cannot reach this app’s Action handler, so it was called directly instead. ' +
  'Set APP_BASE_URL to this deployment’s URL and re-run `npm run hasura:apply` to fix it properly.';

async function callViaHandler<T>(
  spec: ActionSpec,
  variables: Record<string, Json | undefined>,
  token: string,
): Promise<T> {
  const res = await fetch(`/api/hasura/actions/${spec.route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: { name: spec.field }, input: variables }),
  });

  const json = (await res.json().catch(() => null)) as
    | (T & { message?: string; extensions?: { code?: string } })
    | null;

  if (!res.ok) {
    throw new ActionCallError(
      json?.message ?? `The action failed (HTTP ${res.status}).`,
      json?.extensions?.code,
    );
  }
  if (!json) throw new ActionCallError('The action returned no result.');
  return json as T;
}

/**
 * Set once Hasura has proved it cannot reach the handler, so the rest of the
 * session goes straight to the direct transport instead of paying for a failed
 * round trip before every call.
 */
let failedOver = false;
const listeners = new Set<() => void>();

/** A note for the UI when the app is running on the fallback transport. */
export function transportNotice(): string | null {
  return failedOver ? HANDLER_UNREACHABLE_MESSAGE : null;
}

/** Subscribe to failover, so a banner can appear without a page reload. */
export function onTransportChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function callDirect<T>(
  spec: ActionSpec,
  variables: Record<string, Json | undefined>,
): Promise<T> {
  const token = await freshAccessToken();
  if (!token) {
    throw new ActionCallError('Your session has expired. Sign in again.', 'UNAUTHENTICATED');
  }
  return callViaHandler<T>(spec, variables, token);
}

/** Invokes an Action over whichever transport is configured, or still working. */
export async function runAction<T>(
  name: ActionName,
  variables: Record<string, Json | undefined> = {},
): Promise<T> {
  const spec = ACTIONS[name];
  if (actionTransport !== 'hasura' || failedOver) {
    return callDirect<T>(spec, variables);
  }

  try {
    return await callViaHasura<T>(spec, variables);
  } catch (error) {
    if (error instanceof ActionCallError && error.code === 'HANDLER_UNREACHABLE') {
      failedOver = true;
      for (const listener of listeners) listener();
      return callDirect<T>(spec, variables);
    }
    throw error;
  }
}

export interface TriggerRunResult {
  workflow_run_id: string;
  workflow_id: string;
  status: string;
  step_count: number;
}

export interface StepDecisionResult {
  step_run_id: string;
  workflow_run_id: string;
  decision: string;
  run_status: string;
}

export interface WebhookEndpointResult {
  trigger_id: string;
  graphql_endpoint: string;
  rest_endpoint: string;
  secret: string;
  sample_curl: string;
}

export interface WebhookSecretResult {
  trigger_id: string;
  rest_endpoint: string;
  secret: string;
}
