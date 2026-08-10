async function testUrls() {
  const paths = [
    '/v1/trigger-workflow-run',
    '/v1/functions/trigger-workflow-run',
    '/functions/trigger-workflow-run',
    '/v1/approve-step',
    '/v1/functions/approve-step'
  ];
  
  for (const path of paths) {
    const url = `https://osouykwsxrtvrkapwnwp.functions.ap-south-1.nhost.run${path}`;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const text = await res.text();
      console.log(`Path: ${path} -> Status: ${res.status}, Body: ${text.slice(0, 100)}`);
    } catch (e) {
      console.log(`Path: ${path} -> Error: ${e.message}`);
    }
  }
}

testUrls();
