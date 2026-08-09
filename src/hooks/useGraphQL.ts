import { useAccessToken } from '@nhost/react';
import { nhost } from '@/lib/nhost';

export function useGraphQL() {
  const accessToken = useAccessToken();

  const request = async <T = any>(query: string, variables?: Record<string, any>): Promise<T> => {
    const response = await fetch(nhost.graphql.httpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    
    const json = await response.json();
    
    if (json.errors) {
      console.error('GraphQL Errors:', json.errors);
      throw new Error(json.errors[0].message);
    }
    
    return json.data as T;
  };

  return { request };
}
