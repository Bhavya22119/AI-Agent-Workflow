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

    // 1. Get the user's ID by verifying their token against Hasura
    const userRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        query: `
          query GetUser {
            users {
              id
            }
          }
        `
      })
    });
    
    const userData = await userRes.json();
    
    if (userData.errors || !userData.data?.users?.[0]?.id) {
      console.error('Verify error:', userData.errors);
      return NextResponse.json({ error: 'Failed to verify user token' }, { status: 401 });
    }

    const userId = userData.data.users[0].id;

    // 2. Call the Nhost serverless function directly with the Hasura Action payload shape
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
