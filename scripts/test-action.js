async function testHasuraActionPayload() {
  const url = 'https://osouykwsxrtvrkapwnwp.functions.ap-south-1.nhost.run/v1/trigger-workflow-run';
  const payload = {
    action: { name: 'triggerWorkflowRun' },
    input: { workflow_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
    session_variables: {
      'x-hasura-user-id': 'a3fba0f2-0329-45ca-b3fc-29883f2ec67d',
      'x-hasura-role': 'owner'
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}
testHasuraActionPayload();
