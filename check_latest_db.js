const fetch = require('node-fetch');
const GRAPHQL_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql';
const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';
async function run() {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({
      query: `query {
        workflow_runs(order_by: { started_at: desc }, limit: 1) {
          id
          status
          started_at
          step_runs(order_by: { position: asc }) {
            position
            status
            workflow_step { type config }
            error
          }
        }
      }`
    })
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
run();
