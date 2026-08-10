const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';
const HASURA_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/graphql';

async function query(gql) {
  const res = await fetch(HASURA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query: gql }),
  });
  return await res.json();
}

async function main() {
  const wfId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orgId = '11111111-1111-1111-1111-111111111111';

  console.log('Inserting Demo Workflow...');

  // 1. Insert Workflow
  await query(`
    mutation {
      insert_workflows_one(
        object: {
          id: "${wfId}",
          org_id: "${orgId}",
          name: "🤖 AI Sentiment & Support Automation Demo",
          description: "Complete 5-step demo: LLM Sentiment Analysis -> HTTP Post -> Conditional Check -> Human Approval Gate -> DB Save"
        },
        on_conflict: { constraint: workflows_pkey, update_columns: [name, description] }
      ) { id name }
    }
  `);

  // 2. Clear old steps
  await query(`mutation { delete_workflow_steps(where: { workflow_id: { _eq: "${wfId}" } }) { affected_rows } }`);

  // 3. Insert Steps individually
  const steps = [
    { pos: 1, type: 'llm_call', config: '{"prompt": "Analyze the sentiment of: {{input}}. Respond with positive, negative, or neutral.", "model": "llama3-8b-8192"}' },
    { pos: 2, type: 'http_request', config: '{"url": "https://httpbin.org/post", "method": "POST", "headers": {"Content-Type": "application/json"}, "body": "{\\"sentiment\\": \\"{{prev_output}}\\"}"}' },
    { pos: 3, type: 'conditional_branch', config: '{"condition": {"path": "$.result", "operator": "contains", "value": "positive"}, "true_next": 4, "false_next": 5}' },
    { pos: 4, type: 'approval_gate', config: '{"message": "The AI detected positive sentiment! Please review and approve to save this entry into database outputs."}' },
    { pos: 5, type: 'db_write', config: '{"key": "final_sentiment_result", "value_template": "{{prev_output}}"}' }
  ];

  for (const s of steps) {
    const res = await query(`
      mutation {
        insert_workflow_steps_one(object: {
          workflow_id: "${wfId}",
          position: ${s.pos},
          type: ${s.type},
          config: ${JSON.stringify(s.config)}
        }) { id position }
      }
    `);
    console.log(`Step ${s.pos} (${s.type}):`, res);
  }

  console.log('\n--- DEMO WORKFLOW STEPS CREATED SUCCESSFULLY ---');
}

main().catch(console.error);
