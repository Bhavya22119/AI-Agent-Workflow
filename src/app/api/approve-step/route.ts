import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow } from '@/lib/engine/executor';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 60; // Allow up to 60 seconds for long workflows

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

export async function POST(req: NextRequest) {
  try {
    const { step_run_id, user_id } = await req.json();
    
    if (!step_run_id) return NextResponse.json({ message: 'step_run_id required' }, { status: 400 });
    if (!user_id) return NextResponse.json({ message: 'user_id required' }, { status: 400 });
    
    // 1. Get step run + run details
    const stepData = await adminQuery(`
      query($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id status position
          workflow_run { id org_id }
        }
      }
    `, { id: step_run_id });
    
    const stepRun = stepData.step_runs_by_pk;
    if (!stepRun) return NextResponse.json({ message: 'Step run not found' }, { status: 404 });
    if (stepRun.status !== 'paused') return NextResponse.json({ message: 'Step is not paused' }, { status: 400 });
    
    const orgId = stepRun.workflow_run.org_id;
    const runId = stepRun.workflow_run.id;
    
    // 2. Verify approver is owner/editor in the org
    const memberData = await adminQuery(`
      query($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId }, role: { _in: [owner, editor] } }) { id role }
      }
    `, { userId: user_id, orgId });
    
    if (!memberData.org_members?.length) {
      return NextResponse.json({ message: 'Insufficient permissions — must be owner or editor' }, { status: 403 });
    }
    
    // 3. Mark step as completed with approver info
    await adminQuery(`
      mutation($id: uuid!, $userId: uuid!, $time: timestamptz!) {
        update_step_runs(
          where: { id: { _eq: $id }, status: { _eq: paused } },
          _set: { status: completed, approved_by: $userId, approved_at: $time, completed_at: $time }
        ) { affected_rows }
      }
    `, { id: step_run_id, userId: user_id, time: new Date().toISOString() });
    
    // 4. Set run back to running
    await adminQuery(`
      mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: running }) { id } }
    `, { id: runId });
    
    // 5. Resume execution from next position using real executor
    const nextPos = stepRun.position + 1;
    
    // Get remaining steps to see if any are left
    const stepsData = await adminQuery(`
      query($runId: uuid!, $startPos: Int!) {
        step_runs(where: { workflow_run_id: { _eq: $runId }, position: { _gte: $startPos } }, order_by: { position: asc }) {
          id
        }
      }
    `, { runId, startPos: nextPos });
    
    // Execute remaining steps
    if (stepsData.step_runs?.length > 0) {
      waitUntil(
        executeWorkflow(runId, nextPos).catch(err => {
          console.error("Error resuming workflow:", err);
        })
      );
    } else {
      // No more steps — mark run completed
      await adminQuery(`
        mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: completed, completed_at: "now()" }) { id } }
      `, { id: runId });
    }
    
    return NextResponse.json({ workflow_run_id: runId, status: 'running' });
  } catch (error: any) {
    console.error('approve-step API error:', error);
    return NextResponse.json({ message: error.message || 'Internal error' }, { status: 500 });
  }
}
