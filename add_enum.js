const fetch = require('node-fetch');
async function run() {
  const sql = "ALTER TYPE trigger_type ADD VALUE 'schedule'; ALTER TYPE trigger_type ADD VALUE 'db_event';";
  
  const q = {
    type: 'run_sql',
    args: { sql }
  };
  
  const res = await fetch('https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v2/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s' },
    body: JSON.stringify(q)
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
run();
