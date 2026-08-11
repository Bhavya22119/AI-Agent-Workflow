import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow } from '@/lib/engine/executor';
import { waitUntil } from '@vercel/functions';
import cronParser from 'cron-parser';

export const maxDuration = 60; // Up to 60 seconds

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

export async function GET(req: NextRequest) {
  try {
    // 1. Verify Vercel Cron Secret
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // In development, allow local triggering. In prod, enforce CRON_SECRET.
      if (process.env.NODE_ENV === 'production') {
        return new Response('Unauthorized', { status: 401 });
      }
    }
    
    // 2. Fetch all active workflows with a schedule_trigger
    const data = await adminQuery(`
      query {
        workflow_steps(where: { type: { _eq: "schedule_trigger" } }) {
          workflow_id
          config
          workflow { id org_id }
        }
      }
    `);
    
    const steps = data.workflow_steps || [];
    const now = new Date();
    let triggeredCount = 0;
    
    // 3. Evaluate crons
    for (const step of steps) {
      if (!step.workflow) continue;
      
      const expression = step.config?.cron_expression;
      if (!expression) continue;
      
      try {
        // Evaluate if it should have run in the last 5 minutes (since Vercel cron hits every 5 mins)
        const interval = cronParser.parseExpression(expression);
        const prev = interval.prev().toDate();
        
        // If the previous scheduled time is within the last 5 minutes and 1 second, trigger it
        const diffMs = now.getTime() - prev.getTime();
        
        if (diffMs >= 0 && diffMs <= 301000) {
          // It should run!
          console.log(`Triggering scheduled workflow: ${step.workflow_id}`);
          
          const runData = await adminQuery(`
            mutation CreateRun($orgId: uuid!, $workflowId: uuid!) {
              insert_workflow_runs_one(object: { org_id: $orgId, workflow_id: $workflowId, status: pending, context: { "source": "schedule" } }) { id }
            }
          `, { orgId: step.workflow.org_id, workflowId: step.workflow.id });
          
          const workflowRunId = runData.insert_workflow_runs_one.id;
          
          // Create Step Runs
          const stepsData = await adminQuery(`
            query($workflowId: uuid!) {
              workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { position: asc }) { id position }
            }
          `, { workflowId: step.workflow_id });
          
          const stepRunObjects = (stepsData.workflow_steps || []).map((s: any) => ({
            workflow_run_id: workflowRunId,
            workflow_step_id: s.id,
            position: s.position,
            status: 'pending',
          }));
          
          if (stepRunObjects.length > 0) {
            await adminQuery(`
              mutation CreateStepRuns($objects: [step_runs_insert_input!]!) {
                insert_step_runs(objects: $objects) { affected_rows }
              }
            `, { objects: stepRunObjects });
          }
          
          // Start execution in background
          waitUntil(
            executeWorkflow(workflowRunId, 1).catch(err => {
              console.error('Schedule execution failed:', err);
            })
          );
          
          triggeredCount++;
        }
      } catch (err: any) {
        console.error(`Invalid cron expression for workflow ${step.workflow_id}:`, expression);
      }
    }
    
    return NextResponse.json({ success: true, triggeredCount });
  } catch (error: any) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
