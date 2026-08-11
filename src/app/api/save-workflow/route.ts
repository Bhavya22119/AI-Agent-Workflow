import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { workflowId, steps, triggers, orgId } = body;

    if (!workflowId || !orgId) {
      return NextResponse.json({ error: 'Missing workflowId or orgId' }, { status: 400 });
    }

    const graphqlUrl = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`;

    // 1. Verify user's role in the org using their own token
    const verifyRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        query: `
          query VerifyRole($orgId: uuid!) {
            org_members(where: { org_id: { _eq: $orgId } }) {
              role
            }
          }
        `,
        variables: { orgId }
      })
    });
    
    const verifyData = await verifyRes.json();
    
    if (verifyData.errors) {
      console.error('Verify error:', verifyData.errors);
      return NextResponse.json({ error: 'Failed to verify role' }, { status: 403 });
    }

    const role = verifyData.data?.org_members?.[0]?.role;
    if (role !== 'owner' && role !== 'editor') {
      return NextResponse.json({ error: 'Forbidden: You must be an owner or editor to modify this workflow.' }, { status: 403 });
    }

    // 2. Perform the delete + insert using Admin Secret
    const saveRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET!
      },
      body: JSON.stringify({
        query: `
          mutation UpdateWorkflow($workflowId: uuid!, $steps: [workflow_steps_insert_input!]!, $triggers: [workflow_triggers_insert_input!]!) {
            delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) { affected_rows }
            delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) { affected_rows }
            insert_workflow_steps(objects: $steps) { affected_rows }
            insert_workflow_triggers(objects: $triggers) { affected_rows }
          }
        `,
        variables: { workflowId, steps, triggers }
      })
    });

    const saveData = await saveRes.json();
    if (saveData.errors) {
      console.error('Save error:', saveData.errors);
      return NextResponse.json({ error: saveData.errors[0].message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: saveData.data });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
