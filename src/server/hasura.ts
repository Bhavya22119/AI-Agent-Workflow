/**
 * Admin GraphQL client for the engine and Action handlers.
 *
 * Everything the engine writes (runs, step_runs, outputs, notifications) goes
 * through here with the admin secret, because those tables grant no write
 * permission to any Hasura role. Authorization for those writes is performed in
 * the handlers and in start_workflow_run(), not by Hasura row permissions.
 */
import { serverEnv } from './env';

export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    readonly errors: unknown,
  ) {
    super(message);
    this.name = 'GraphQLRequestError';
  }
}

export async function adminGraphql<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(serverEnv.graphqlUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hasura-admin-secret': serverEnv.adminSecret,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
  };

  if (json.errors?.length) {
    throw new GraphQLRequestError(json.errors.map((e) => e.message).join('; '), json.errors);
  }
  if (!json.data) {
    throw new GraphQLRequestError(`Empty GraphQL response (HTTP ${res.status})`, null);
  }
  return json.data;
}

/**
 * Runs a GraphQL request as a specific user, with all row-level permissions
 * applied, by impersonating them through the admin secret. Used where a handler
 * wants the database itself to answer "is this row visible to this caller?"
 * rather than re-implementing the predicate in TypeScript.
 */
export async function impersonatedGraphql<T = Record<string, unknown>>(
  userId: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(serverEnv.graphqlUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hasura-admin-secret': serverEnv.adminSecret,
      'x-hasura-role': 'user',
      'x-hasura-user-id': userId,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new GraphQLRequestError(json.errors.map((e) => e.message).join('; '), json.errors);
  }
  if (!json.data) {
    throw new GraphQLRequestError(`Empty GraphQL response (HTTP ${res.status})`, null);
  }
  return json.data;
}
