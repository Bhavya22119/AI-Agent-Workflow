import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow } from '@/lib/engine/executor';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 60; // Allow up to 60 seconds

const GRAPHQL_URL = `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1'}.nhost.run/v1/graphql`;
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || '';

async function adminQuery(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await response.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

export async function POST(req: NextRequest, props: { params: Promise<{ workflowId: string }> }) {
  try {
    const params = await props.params;
    const { workflowId } = params;
    
    // 1. Get the workflow and its triggers
    const workflowData = await adminQuery(`
      query($id: uuid!) {
        workflows_by_pk(id: $id) {
          id org_id
          workflow_triggers(where: { type: { _eq: "webhook" } }) { id config webhook_secret }
        }
      }
    `, { id: workflowId });
    
    const workflow = workflowData.workflows_by_pk;
    if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    
    const triggerNode = workflow.workflow_triggers?.[0];
    if (!triggerNode) return NextResponse.json({ error: 'Workflow does not have a Webhook Trigger configured' }, { status: 400 });
    
    // 2. Check secret if configured
    const expectedSecret = triggerNode.webhook_secret || triggerNode.config?.webhook_secret;
    if (expectedSecret) {
      // Allow passing secret in header 'x-webhook-secret' or 'authorization' or query param 'secret'
      const providedSecret = req.headers.get('x-webhook-secret') || 
                             req.headers.get('authorization')?.replace('Bearer ', '') ||
                             req.nextUrl.searchParams.get('secret');
                             
      if (providedSecret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized: Invalid webhook secret' }, { status: 401 });
      }
    }
    
    // 3. Extract payload
    let payload = {};
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        payload = await req.json();
      } else {
        payload = { body: await req.text() };
      }
    } catch (e) {
      // payload remains empty object
    }
    
    // 4. Create Run
    const runData = await adminQuery(`
      mutation CreateRun($orgId: uuid!, $workflowId: uuid!, $context: jsonb!) {
        insert_workflow_runs_one(object: { org_id: $orgId, workflow_id: $workflowId, status: pending, context: $context }) { id }
      }
    `, { orgId: workflow.org_id, workflowId: workflow.id, context: payload });
    
    const workflowRunId = runData.insert_workflow_runs_one.id;
    
    // 5. Create Step Runs
    const stepsData = await adminQuery(`
      query($workflowId: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { position: asc }) { id position }
      }
    `, { workflowId });
    
    const stepRunObjects = (stepsData.workflow_steps || []).map((step: any) => ({
      workflow_run_id: workflowRunId,
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
    
    // 6. Execute asynchronously
    waitUntil(
      executeWorkflow(workflowRunId, 1).catch(err => {
        console.error('Webhook execution failed:', err);
      })
    );
    
    return NextResponse.json({ success: true, workflow_run_id: workflowRunId });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
