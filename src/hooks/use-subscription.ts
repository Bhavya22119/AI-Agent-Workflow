'use client';

/**
 * GraphQL subscriptions over Hasura's WebSocket transport.
 *
 * One shared graphql-ws client for the whole app. `connectionParams` is a
 * function, so it runs on every (re)connect and can hand over a freshly
 * refreshed token — a long-lived subscription otherwise dies silently when the
 * access token behind it expires.
 *
 * Hasura applies the same row-level permissions to a subscription as to a query,
 * so an Org B user who subscribes with an Org A run id gets an empty result set
 * rather than a stream of somebody else's data.
 */
import { useEffect, useState } from 'react';
import { createClient, type Client } from 'graphql-ws';
import { GRAPHQL_WS_URL } from '@/lib/nhost';
import { freshAccessToken } from '@/lib/graphql-client';

let sharedClient: Client | null = null;

function getClient(): Client {
  if (sharedClient) return sharedClient;
  sharedClient = createClient({
    url: GRAPHQL_WS_URL,
    lazy: true,
    retryAttempts: 12,
    shouldRetry: () => true,
    connectionParams: async () => {
      const token = await freshAccessToken();
      return { headers: token ? { Authorization: `Bearer ${token}` } : {} };
    },
  });
  return sharedClient;
}

/** Drops the socket on sign-out so the next user does not inherit it. */
export function resetSubscriptionClient(): void {
  sharedClient?.dispose();
  sharedClient = null;
}

interface SubscriptionState<T> {
  data: T | null;
  error: string | null;
  /** True until the first payload for the current subscription arrives. */
  connecting: boolean;
}

export function useSubscription<T>(
  document: string,
  variables: Record<string, unknown> = {},
  options: { skip?: boolean } = {},
): SubscriptionState<T> {
  const skip = options.skip ?? false;
  const variablesKey = JSON.stringify(variables);
  const subscriptionKey = `${document}|${variablesKey}`;

  // Keyed state, so "connecting" is derived rather than set from the effect.
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null }>({
    key: '',
    data: null,
    error: null,
  });

  useEffect(() => {
    if (skip) return;
    let active = true;

    const unsubscribe = getClient().subscribe<T>(
      { query: document, variables: JSON.parse(variablesKey) as Record<string, unknown> },
      {
        next: (payload) => {
          if (!active) return;
          if (payload.errors?.length) {
            setResult({
              key: subscriptionKey,
              data: null,
              error: payload.errors.map((e) => e.message).join('; '),
            });
          } else {
            setResult({ key: subscriptionKey, data: payload.data ?? null, error: null });
          }
        },
        error: (err) => {
          if (!active) return;
          const message =
            err instanceof Error
              ? err.message
              : Array.isArray(err)
                ? err.map((e) => (e as { message?: string }).message ?? String(e)).join('; ')
                : 'The live connection failed.';
          setResult({ key: subscriptionKey, data: null, error: message });
        },
        complete: () => {
          if (!active) return;
          // Mark the stream as settled even if it produced nothing.
          setResult((current) =>
            current.key === subscriptionKey ? current : { key: subscriptionKey, data: null, error: null },
          );
        },
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [subscriptionKey, document, variablesKey, skip]);

  const settled = result.key === subscriptionKey;

  return {
    data: settled ? result.data : null,
    error: settled ? result.error : null,
    connecting: !skip && !settled,
  };
}
