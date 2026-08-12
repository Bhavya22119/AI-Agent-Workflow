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
      // The single most likely local-development failure, made actionable.
      if (/could not connect|connection error|ConnectionError|unexpected/i.test(error.message)) {
        throw new ActionCallError(
          'Hasura could not reach the Action handler. If you are running locally, set ' +
            'NEXT_PUBLIC_ACTION_TRANSPORT=direct in .env.local (see the README).',
          'HANDLER_UNREACHABLE',
        );
      }
      throw new ActionCallError(error.message, error.code);
    }
    throw error;
  }
}

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

/** Invokes an Action over whichever transport is configured. */
export async function runAction<T>(
  name: ActionName,
  variables: Record<string, Json | undefined> = {},
): Promise<T> {
  const spec = ACTIONS[name];
  if (actionTransport === 'hasura') {
    return callViaHasura<T>(spec, variables);
  }

  const token = await freshAccessToken();
  if (!token) {
    throw new ActionCallError('Your session has expired. Sign in again.', 'UNAUTHENTICATED');
  }
  return callViaHandler<T>(spec, variables, token);
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
