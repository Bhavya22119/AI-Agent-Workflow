const ADMIN_SECRET = 'x9K2mP4vL8zN1qR7wY5jT3cM6bF9hD2s';
const NHOST_URL = 'https://osouykwsxrtvrkapwnwp.hasura.ap-south-1.nhost.run/v1/metadata';
const FUNCTIONS_URL = 'https://osouykwsxrtvrkapwnwp.functions.ap-south-1.nhost.run/v1';

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
    console.log(`INFO [${payload.type}]:`, data.message || data.error);
  } else {
    console.log(`SUCCESS [${payload.type}]`);
  }
  return data;
}

async function main() {
  console.log('1. Setting Custom Types...');
  await sendOne({
    type: 'set_custom_types',
    args: {
      input_objects: [],
      objects: [
        {
          name: 'TriggerWorkflowRunOutput',
          fields: [
            { name: 'workflow_run_id', type: 'uuid!' },
            { name: 'status', type: 'String!' }
          ]
        },
        {
          name: 'ApproveStepOutput',
          fields: [
            { name: 'workflow_run_id', type: 'uuid!' },
            { name: 'status', type: 'String!' }
          ]
        }
      ],
      scalars: [],
      enums: []
    }
  });

  console.log('\n2. Dropping existing actions (if any)...');
  await sendOne({ type: 'drop_action', args: { name: 'triggerWorkflowRun' } });
  await sendOne({ type: 'drop_action', args: { name: 'approveStep' } });
  await sendOne({ type: 'drop_action', args: { name: 'invokeWorkflowWebhook' } });

  console.log('\n3. Creating Actions...');
  
  // triggerWorkflowRun
  await sendOne({
    type: 'create_action',
    args: {
      name: 'triggerWorkflowRun',
      definition: {
        kind: 'synchronous',
        handler: `${FUNCTIONS_URL}/trigger-workflow-run`,
        forward_client_headers: true,
        arguments: [
          { name: 'workflow_id', type: 'uuid!' }
        ],
        output_type: 'TriggerWorkflowRunOutput'
      }
    }
  });

  // approveStep
  await sendOne({
    type: 'create_action',
    args: {
      name: 'approveStep',
      definition: {
        kind: 'synchronous',
        handler: `${FUNCTIONS_URL}/approve-step`,
        forward_client_headers: true,
        arguments: [
          { name: 'step_run_id', type: 'uuid!' }
        ],
        output_type: 'ApproveStepOutput'
      }
    }
  });

  // invokeWorkflowWebhook
  await sendOne({
    type: 'create_action',
    args: {
      name: 'invokeWorkflowWebhook',
      definition: {
        kind: 'synchronous',
        handler: `${FUNCTIONS_URL}/invoke-workflow-webhook`,
        arguments: [
          { name: 'workflow_id', type: 'uuid!' },
          { name: 'secret', type: 'String!' },
          { name: 'payload', type: 'jsonb' }
        ],
        output_type: 'TriggerWorkflowRunOutput'
      }
    }
  });

  console.log('\n4. Creating Action Permissions...');
  const roles = ['user', 'owner', 'editor'];
  
  for (const role of roles) {
    await sendOne({
      type: 'create_action_permission',
      args: {
        action: 'triggerWorkflowRun',
        role
      }
    });

    await sendOne({
      type: 'create_action_permission',
      args: {
        action: 'approveStep',
        role
      }
    });
  }

  console.log('\n5. Fixing org_usage_summary relationship & permissions...');
  // Create relationship
  await sendOne({
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
  });

  // Drop select permission if exists
  for (const role of ['user', 'owner', 'editor', 'viewer']) {
    await sendOne({
      type: 'pg_drop_select_permission',
      args: { source: 'default', table: { schema: 'public', name: 'org_usage_summary' }, role }
    });
  }

  // Create select permissions for org_usage_summary
  for (const role of ['user', 'owner', 'editor', 'viewer']) {
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

  console.log('\n--- ALL ACTIONS AND SUMMARY SETUP COMPLETE ---');
}

main().catch(console.error);
