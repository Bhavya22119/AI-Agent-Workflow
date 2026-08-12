/**
 * Browser GraphQL access.
 *
 * Goes through nhost.graphql rather than raw fetch so the SDK's middleware
 * chain applies: it attaches the access token and refreshes it before it
 * expires. Doing this by hand with fetch + localStorage is how apps end up
 * throwing JWTExpired at users who left a tab open.
 */
import { FetchError } from '@nhost/nhost-js/fetch';
import { nhost } from './nhost';

export class GraphQLError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'GraphQLError';
  }
}

/** Turns Hasura's permission errors into something worth showing a user. */
function humanize(message: string): string {
  if (/permission|not found in type|Unauthorized/i.test(message)) {
    return `${message} — your role in this organization does not allow that.`;
  }
  return message;
}

export async function gqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  try {
    const response = await nhost.graphql.request<T>({ query, variables });
    const { data, errors } = response.body;

    if (errors?.length) {
      const first = errors[0];
      throw new GraphQLError(
        humanize(first.message),
        (first.extensions as { code?: string } | undefined)?.code,
      );
    }
    if (data === undefined || data === null) {
      throw new GraphQLError('The server returned no data.');
    }
    return data;
  } catch (error) {
    if (error instanceof GraphQLError) throw error;
    if (error instanceof FetchError) {
      throw new GraphQLError(humanize(error.message), String(error.status));
    }
    throw new GraphQLError(
      error instanceof Error ? error.message : 'Network request failed.',
    );
  }
}

/** Ensures the stored token is valid for at least a minute, then returns it. */
export async function freshAccessToken(): Promise<string | null> {
  const session = await nhost.refreshSession(60).catch(() => null);
  return session?.accessToken ?? nhost.getUserSession()?.accessToken ?? null;
}
