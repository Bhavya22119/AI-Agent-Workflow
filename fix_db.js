const fetch = require('node-fetch');
async function run() {
  const q = `mutation { 
    update_workflow_runs(where: {status: {_eq: "running"}}, _set: {status: failed}) { affected_rows } 
    update_step_runs(where: {status: {_eq: "running"}}, _set: {status: failed, error: "Failed due to timeout or decommissioned model"}) { affected_rows } 
  }`;
  const res = await fetch('https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s' },
    body: JSON.stringify({ query: q })
  });
  console.log(await res.json());
}
run();
