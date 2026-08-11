const fetch = require('node-fetch');
async function run() {
  const res = await fetch('https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s' },
    body: JSON.stringify({ query: '{ workflow_runs_by_pk(id: "cbf0b1fa-112c-4b35-b57d-818e3e2bfca6") { status step_runs { position status workflow_step { type } } } }' })
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
run();
