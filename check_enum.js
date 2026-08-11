const fetch = require('node-fetch');
async function run() {
  const q = '{ __type(name: "step_type") { name kind enumValues { name } } }';
  const res = await fetch('https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s' },
    body: JSON.stringify({ query: q })
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
run();
