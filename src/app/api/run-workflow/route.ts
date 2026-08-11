import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { workflowId } = body;

    if (!workflowId) {
      return NextResponse.json({ error: 'Missing workflowId' }, { status: 400 });
    }

    const graphqlUrl = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`;

    // 1. Get org_id for this workflow using Admin Secret
    const wfRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET!
      },
      body: JSON.stringify({
        query: `
          query GetWorkflowOrg($workflowId: uuid!) {
            workflows_by_pk(id: $workflowId) {
              org_id
            }
          }
        `,
        variables: { workflowId }
      })
    });
    
    const wfData = await wfRes.json();
    const orgId = wfData.data?.workflows_by_pk?.org_id;
    if (!orgId) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // 2. Verify user's role and get their user_id using their token
    const userRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        query: `
          query GetUserRole($orgId: uuid!) {
            org_members(where: { org_id: { _eq: $orgId } }) {
              user_id
              role
            }
          }
        `,
        variables: { orgId }
      })
    });
    
    const userData = await userRes.json();
    const member = userData.data?.org_members?.[0];
    
    if (userData.errors || !member) {
      console.error('Verify error:', userData.errors);
      return NextResponse.json({ error: 'Failed to verify user token or not a member' }, { status: 401 });
    }

    const userId = member.user_id;
    const role = member.role;
    
    if (role !== 'owner' && role !== 'editor') {
      return NextResponse.json({ error: 'Forbidden: You must be an owner or editor to run this workflow.' }, { status: 403 });
    }

    // 3. Call the Nhost serverless function directly with the Hasura Action payload shape
    const funcUrl = `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.functions.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/trigger-workflow-run`;
    
    const funcRes = await fetch(funcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_variables: { 'x-hasura-user-id': userId },
        input: { workflow_id: workflowId }
      })
    });

    const funcData = await funcRes.json();
    
    if (!funcRes.ok) {
      console.error('Nhost function error:', funcData);
      return NextResponse.json({ error: funcData.message || 'Failed to trigger workflow' }, { status: funcRes.status });
    }

    return NextResponse.json(funcData);
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
