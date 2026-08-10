const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';
const NHOST_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/metadata';

async function sendBulk(payloads) {
  const res = await fetch(NHOST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({
      type: 'bulk',
      args: payloads,
    }),
  });
  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

async function main() {
  const payloads = [
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_usage_summary' },
        name: 'organization',
        using: {
          manual_configuration: {
            remote_table: { schema: 'public', name: 'organizations' },
            column_mapping: { org_id: 'id' }
          }
        }
      }
    },
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_usage_summary' },
        role: 'user',
        permission: {
          columns: '*',
          filter: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } }
        }
      }
    }
  ];

  console.log('Tracking org_usage_summary relationship and permission...');
  await sendBulk(payloads);
  console.log('ALL DONE!');
}

main().catch(console.error);
