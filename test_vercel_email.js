const fetch = require('node-fetch');
const GRAPHQL_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql';
const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';

async function run() {
  // 1. Create a dummy workflow
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({
      query: `mutation {
        insert_workflows_one(object: {
          org_id: "385db9a2-9e32-41df-a5df-cb89d5f756b1",
          name: "Test Email Workflow",
          status: "active"
        }) { id }
      }`
    })
  });
  const data = await res.json();
  const workflowId = data.data.insert_workflows_one.id;
  
  // 2. Add a Notify step to the workflow pointing to Ethereal
  await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({
      query: `mutation {
        insert_workflow_steps_one(object: {
          workflow_id: "${workflowId}",
          position: 1,
          type: "notify",
          config: {
            recipient: "rnromdfuqykfzziu@ethereal.email",
            message: "This is a test email from Vercel!"
          }
        }) { id }
      }`
    })
  });
  
  console.log('Created workflow', workflowId);

  // 3. Trigger it using the Vercel API
  const runRes = await fetch('https://ai-agent-workflow-one.vercel.app/api/run-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflowId })
  });
  const runData = await runRes.json();
  console.log('Triggered run:', runData);
}
run();
