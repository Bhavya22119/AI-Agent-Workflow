const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';
const NHOST_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/metadata';

async function sendOne(payload) {
  const res = await fetch(NHOST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.error) {
    console.log(`INFO [${payload.type}] on ${payload.args?.table?.name}:`, data.message || data.error);
  } else {
    console.log(`SUCCESS [${payload.type}] on ${payload.args?.table?.name}`);
  }
}

async function main() {
  const roles = ['user', 'owner', 'editor'];

  console.log('1. Applying workflow_runs insert & update permissions...');
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_runs' },
        role,
        permission: {
          columns: '*',
          check: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } }
        }
      }
    });

    await sendOne({
      type: 'pg_create_update_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_runs' },
        role,
        permission: {
          columns: '*',
          filter: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } }
        }
      }
    });
  }

  console.log('\n2. Applying step_runs insert & update permissions...');
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'step_runs' },
        role,
        permission: {
          columns: '*',
          check: { workflow_run: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } }
        }
      }
    });

    await sendOne({
      type: 'pg_create_update_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'step_runs' },
        role,
        permission: {
          columns: '*',
          filter: { workflow_run: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } }
        }
      }
    });
  }

  console.log('\n--- ALL RUN PERMISSIONS APPLIED ---');
}

main().catch(console.error);
