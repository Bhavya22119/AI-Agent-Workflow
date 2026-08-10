const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';
const HASURA_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/query';

async function runSql(sql) {
  const res = await fetch(HASURA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({
      type: 'run_sql',
      args: {
        source: 'default',
        sql: sql
      }
    })
  });
  const data = await res.json();
  console.log('SQL Result:', JSON.stringify(data, null, 2));
}

async function main() {
  const sql = `
    CREATE OR REPLACE VIEW org_usage_summary AS 
    SELECT 
      o.id as org_id, 
      o.name, 
      o.quota_allowed, 
      (SELECT COUNT(*)::integer FROM workflow_runs wr WHERE wr.org_id = o.id) as quota_used, 
      o.usage_period_start, 
      (o.quota_allowed - (SELECT COUNT(*)::integer FROM workflow_runs wr WHERE wr.org_id = o.id)) as quota_remaining, 
      ROUND(((SELECT COUNT(*)::numeric FROM workflow_runs wr WHERE wr.org_id = o.id) / NULLIF(o.quota_allowed, 0)::numeric) * 100, 2) as usage_percentage, 
      (SELECT COUNT(*) FROM workflow_runs wr WHERE wr.org_id = o.id) as total_runs, 
      (SELECT COUNT(*) FROM workflows w WHERE w.org_id = o.id) as total_workflows 
    FROM organizations o;
  `;

  console.log('Updating org_usage_summary view for automatic real-time quota tracking...');
  await runSql(sql);
}

main().catch(console.error);
