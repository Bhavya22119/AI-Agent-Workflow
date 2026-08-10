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
    console.error(`FAILED [${payload.type}] on ${payload.args?.table?.name || 'unknown'}:`, data.message || data.error);
  } else {
    console.log(`SUCCESS [${payload.type}] on ${payload.args?.table?.name || 'unknown'}`);
  }
}

async function main() {
  const roles = ['user', 'owner', 'editor', 'viewer'];
  
  // 1. Drop existing permissions first to clean state
  const tables = ['org_members', 'organizations', 'workflows', 'workflow_steps', 'workflow_triggers', 'workflow_runs', 'step_runs', 'workflow_outputs', 'watched_records', 'org_usage_summary'];
  const actions = ['select', 'insert', 'update', 'delete'];
  
  for (const table of tables) {
    for (const role of roles) {
      for (const action of actions) {
        await sendOne({
          type: `pg_drop_${action}_permission`,
          args: { source: 'default', table: { schema: 'public', name: table }, role }
        });
      }
    }
  }

  console.log('\n--- Applying Select Permissions ---');
  
  // org_members select permission
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_members' },
        role,
        permission: {
          columns: '*',
          filter: { user_id: { _eq: 'X-Hasura-User-Id' } }
        }
      }
    });
  }

  // organizations select permission
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'organizations' },
        role,
        permission: {
          columns: '*',
          filter: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } }
        }
      }
    });
  }

  // workflows select permission
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        role,
        permission: {
          columns: '*',
          filter: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } }
        }
      }
    });
  }

  // workflow_steps select permission
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_steps' },
        role,
        permission: {
          columns: '*',
          filter: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } }
        }
      }
    });
  }

  // workflow_triggers select permission
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_triggers' },
        role,
        permission: {
          columns: '*',
          filter: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } }
        }
      }
    });
  }

  // workflow_runs select permission
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_select_permission',
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

  // step_runs select permission
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_select_permission',
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

  // org_usage_summary select permission
  for (const role of roles) {
    await sendOne({
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_usage_summary' },
        role,
        permission: {
          columns: '*',
          filter: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } }
        }
      }
    });
  }

  console.log('\n--- Applying Insert Permissions ---');
  
  // workflows insert permission
  for (const role of ['user', 'owner', 'editor']) {
    await sendOne({
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        role,
        permission: {
          columns: '*',
          check: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } }
        }
      }
    });
  }

  // workflow_steps insert permission
  for (const role of ['user', 'owner', 'editor']) {
    await sendOne({
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_steps' },
        role,
        permission: {
          columns: '*',
          check: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } }
        }
      }
    });
  }

  // workflow_triggers insert permission
  for (const role of ['user', 'owner', 'editor']) {
    await sendOne({
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_triggers' },
        role,
        permission: {
          columns: '*',
          check: { workflow: { organization: { org_members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } }
        }
      }
    });
  }

  console.log('\n--- DONE ---');
}

main().catch(console.error);
