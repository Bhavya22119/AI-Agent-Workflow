const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'nhost-admin-secret';

export async function adminQuery(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await response.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}
