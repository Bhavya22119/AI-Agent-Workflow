const GRAPHQL_URL = 
  process.env.NHOST_GRAPHQL_URL || 
  (process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
    ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1'}.nhost.run/v1/graphql`
    : 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql');

const ADMIN_SECRET = 
  process.env.NHOST_ADMIN_SECRET || 
  process.env.HASURA_GRAPHQL_ADMIN_SECRET || 
  'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';

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
