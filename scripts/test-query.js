async function testQuotaQuery() {
  const query = `
    query {
      org_usage_summary {
        org_id
        name
        quota_allowed
        quota_used
        quota_remaining
        usage_percentage
        total_runs
        total_workflows
      }
    }
  `;
  
  const res = await fetch('https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s'
    },
    body: JSON.stringify({ query })
  });
  
  console.log('Live Quota Result:', JSON.stringify(await res.json(), null, 2));
}

testQuotaQuery();
