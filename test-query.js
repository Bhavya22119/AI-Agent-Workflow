const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const GRAPHQL_URL = 'https://' + process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN + '.hasura.' + (process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1') + '.nhost.run/v1/graphql';
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || '';

async function run() {
  const query = `
    query { 
      org_members(where: { org_id: { _eq: "77454644-5049-4508-bd16-a8a3fff0277e" } }) { 
        id 
        user_id 
        role 
        user { 
          displayName 
        } 
      } 
    }
  `;
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({ query })
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
run().catch(console.error);
