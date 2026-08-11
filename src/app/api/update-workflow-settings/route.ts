import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { workflowId, name, description, orgId } = body;

    if (!workflowId || !orgId || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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

    // 2. Perform the update using Admin Secret
    const updateRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET!
      },
      body: JSON.stringify({
        query: `
          mutation UpdateWorkflowSettings($id: uuid!, $name: String!, $description: String) {
            update_workflows_by_pk(pk_columns: { id: $id }, _set: { name: $name, description: $description }) {
              id
              name
              description
            }
          }
        `,
        variables: { id: workflowId, name, description: description || null }
      })
    });

    const updateData = await updateRes.json();
    if (updateData.errors) {
      console.error('Update error:', updateData.errors);
      return NextResponse.json({ error: updateData.errors[0].message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: updateData.data.update_workflows_by_pk });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
