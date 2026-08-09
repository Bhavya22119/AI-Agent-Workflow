'use client';

import { useState, useEffect } from 'react';
import { createClient, Client } from 'graphql-ws';
import { nhost } from '@/lib/nhost';

let wsClient: Client | null = null;

function getWsClient() {
  if (wsClient) return wsClient;

  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'osouykwsxrtvrkapwnwp';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
  const wssUrl = `wss://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;

  wsClient = createClient({
    url: wssUrl,
    connectionParams: async () => {
      const token = nhost.auth.getAccessToken();
      return {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      };
    },
    // Optional: reconnect logic can be tuned here, but graphql-ws handles it gracefully by default.
  });

  return wsClient;
}

interface SubscriptionResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export function useSubscription<T = any>(query: string, variables?: Record<string, any>): SubscriptionResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Stringify variables to safely use in dependency array
  const variablesKey = variables ? JSON.stringify(variables) : '';

  useEffect(() => {
    let unsubscribe = () => {};
    const client = getWsClient();

    setLoading(true);

    unsubscribe = client.subscribe(
      {
        query,
        variables,
      },
      {
        next: (result) => {
          if (result.errors) {
            setError(new Error(result.errors.map((e) => e.message).join(', ')));
          } else {
            setData(result.data as T);
            setError(null);
          }
          setLoading(false);
        },
        error: (err) => {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        },
        complete: () => {
          setLoading(false);
        },
      }
    );

    return () => {
      unsubscribe();
    };
  }, [query, variablesKey]);

  return { data, error, loading };
}
