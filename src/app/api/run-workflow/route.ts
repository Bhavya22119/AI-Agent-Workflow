import { NextResponse } from 'next/server';
import { adminQuery } from '@/lib/engine/graphql';
import { executeWorkflow } from '@/lib/engine/executor';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 60; // Allow execution to run up to 60s


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

    // 1. Get org_id for this workflow
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

    // 3. Create workflow_run
    const runData = await adminQuery(`
      mutation CreateRun($workflowId: uuid!, $orgId: uuid!, $startedBy: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflowId,
          org_id: $orgId,
          status: pending,
          started_by: $startedBy
        }) { id status }
      }
    `, { workflowId, orgId, startedBy: userId });
    
    const workflowRun = runData.insert_workflow_runs_one;
    
    // 4. Get steps and create step_runs
    const stepsData = await adminQuery(`
      query GetSteps($workflowId: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { position: asc }) {
          id position type config
        }
      }
    `, { workflowId });
    
    const stepRunObjects = (stepsData.workflow_steps || []).map((step: any) => ({
      workflow_run_id: workflowRun.id,
      workflow_step_id: step.id,
      position: step.position,
      status: 'pending',
    }));
    
    if (stepRunObjects.length > 0) {
      await adminQuery(`
        mutation CreateStepRuns($objects: [step_runs_insert_input!]!) {
          insert_step_runs(objects: $objects) { affected_rows }
        }
      `, { objects: stepRunObjects });
    }
    
    // 5. Start execution asynchronously and use waitUntil so Vercel doesn't kill it
    waitUntil(
      executeWorkflow(workflowRun.id).catch((err: any) => {
        console.error('Workflow execution failed:', err);
      })
    );
    
    return NextResponse.json({ workflow_run_id: workflowRun.id, status: 'pending' });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
