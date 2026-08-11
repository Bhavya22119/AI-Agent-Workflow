const fetch = require('node-fetch');
const GRAPHQL_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql';
const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';

async function run() {
  try {
    // 1. Create a dummy workflow
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
      body: JSON.stringify({
        query: `mutation {
          insert_workflows_one(object: {
            org_id: "77454644-5049-4508-bd16-a8a3fff0277e",
            name: "Test Email Workflow from Agent"
          }) { id }
        }`
      })
    });
    const data = await res.json();
    if (!data.data) { console.error('Error creating workflow:', data); return; }
    
    const workflowId = data.data.insert_workflows_one.id;
    console.log('Created workflow', workflowId);
    
    // 2. Add a Notify step
    const stepRes = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
      body: JSON.stringify({
        query: `mutation {
          insert_workflow_steps_one(object: {
            workflow_id: "${workflowId}",
            position: 1,
            type: "notify",
            config: {
              recipient: "bhavyaverma22119@gmail.com",
              message: "Hello Bhavya! This is a real test email sent by the AI Agent directly from Vercel to verify the integration. If you see this, the code is perfectly working!"
            }
          }) { id }
        }`
      })
    });
    const stepData = await stepRes.json();
    console.log('Created step:', stepData.data.insert_workflow_steps_one.id);

    // 3. Trigger it using the Vercel API
    console.log('Triggering run on Vercel...');
    const runRes = await fetch('https://ai-agent-workflow-one.vercel.app/api/run-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId })
    });
    const runData = await runRes.json();
    console.log('Trigger response:', runData);
    
    const runId = runData.workflow_run_id;
    
    // 4. Poll DB for status
    console.log('Waiting for execution to finish (polling DB)...');
    let attempts = 0;
    while(attempts < 15) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
        body: JSON.stringify({
          query: `query {
            workflow_runs_by_pk(id: "${runId}") {
              status
              step_runs {
                status
                error
              }
            }
          }`
        })
      });
      const pollData = await pollRes.json();
      const runStatus = pollData.data.workflow_runs_by_pk.status;
      const stepRun = pollData.data.workflow_runs_by_pk.step_runs[0];
      
      console.log(`Status: ${runStatus}, Step Status: ${stepRun?.status}, Error: ${stepRun?.error}`);
      
      if (runStatus === 'completed' || runStatus === 'failed') break;
      attempts++;
    }
  } catch (err) {
    console.error('Script Error:', err);
  }
}
run();
