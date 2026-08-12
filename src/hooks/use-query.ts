'use client';

import { useCallback, useEffect, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';

interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Minimal fetch-on-mount GraphQL query hook.
 *
 * `loading` is derived by comparing the key of the data we hold against the key
 * we want, rather than being set from inside the effect. That keeps the effect
 * free of synchronous setState (which React 19 flags, because it causes a
 * cascading render) and makes a variables change show as loading immediately,
 * in the same render that changed them.
 */
export function useQuery<T>(
  document: string,
  variables: Record<string, unknown> = {},
  options: { skip?: boolean } = {},
): QueryState<T> {
  const skip = options.skip ?? false;
  const variablesKey = JSON.stringify(variables);
  const [reloadNonce, setReloadNonce] = useState(0);
  /** Identifies *what* is being asked for; unchanged by a refetch. */
  const queryKey = `${document}|${variablesKey}`;
  /** Identifies this particular attempt; a refetch changes it. */
  const requestKey = `${reloadNonce}|${queryKey}`;

  const [result, setResult] = useState<{
    key: string;
    queryKey: string;
    data: T | null;
    error: string | null;
  }>({ key: '', queryKey: '', data: null, error: null });

  useEffect(() => {
    if (skip) return;
    let cancelled = false;

    gqlRequest<T>(document, JSON.parse(variablesKey) as Record<string, unknown>)
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, queryKey, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({
            key: requestKey,
            queryKey,
            data: null,
            error: error instanceof Error ? error.message : 'Request failed.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey, queryKey, document, variablesKey, skip]);

  const fresh = result.key === requestKey;
  // A refetch of the same query keeps showing the previous rows so the screen
  // does not blank. A change of *what* is asked for (a different organization,
  // say) does not: showing the previous org's rows under the new org's heading
  // would be worse than showing a loader.
  const sameQuery = result.queryKey === queryKey;

  const refetch = useCallback(async () => {
    setReloadNonce((value) => value + 1);
  }, []);

  return {
    data: sameQuery ? result.data : null,
    error: fresh ? result.error : null,
    loading: !skip && !fresh,
    refetch,
  };
}
