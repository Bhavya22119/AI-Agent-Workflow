import { NextRequest, NextResponse } from 'next/server';

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
    
    // 5. Resume execution from next position (import executor logic inline)
    const nextPos = stepRun.position + 1;
    
    // Get remaining steps
    const stepsData = await adminQuery(`
      query($runId: uuid!, $startPos: Int!) {
        step_runs(where: { workflow_run_id: { _eq: $runId }, position: { _gte: $startPos } }, order_by: { position: asc }) {
          id workflow_step_id position status
          workflow_step { type config }
        }
      }
    `, { runId, startPos: nextPos });
    
    // Execute remaining steps
    if (stepsData.step_runs?.length > 0) {
      await executeRemainingSteps(runId, stepsData.step_runs);
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

// Simplified executor for remaining steps after approval
async function executeRemainingSteps(runId: string, stepRuns: any[]) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  let previousOutput: any = null;
  
  // Get previous step output
  const prevData = await adminQuery(`
    query($runId: uuid!, $pos: Int!) {
      step_runs(where: { workflow_run_id: { _eq: $runId }, position: { _lt: $pos } }, order_by: { position: desc }, limit: 1) { output }
    }
  `, { runId, pos: stepRuns[0].position });
  previousOutput = prevData.step_runs?.[0]?.output || {};

  for (const stepRun of stepRuns) {
    if (stepRun.status === 'skipped') continue;
    try {
      await adminQuery(`mutation($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: running, started_at: "now()" }) { id } }`, { id: stepRun.id });
      
      const config = stepRun.workflow_step.config || {};
      const type = stepRun.workflow_step.type;
      let output: any;

      if (type === 'approval_gate') {
        await adminQuery(`mutation($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: paused }) { id } }`, { id: stepRun.id });
        await adminQuery(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: paused }) { id } }`, { id: runId });
        return;
      } else if (type === 'llm_call') {
        const prompt = config.prompt?.replace(/\{\{.*?\}\}/g, typeof previousOutput === 'object' ? JSON.stringify(previousOutput) : String(previousOutput || '')) || '';
        if (GROQ_API_KEY) {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({ model: config.model || 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 1024 }),
          });
          const data: any = await res.json();
          output = { result: data.choices?.[0]?.message?.content || '', provider: 'groq' };
        } else {
          await new Promise(r => setTimeout(r, 1000));
          output = { result: '[STUB] positive sentiment detected', provider: 'stub' };
        }
      } else if (type === 'http_request') {
        const url = config.url || 'https://httpbin.org/get';
        const res = await fetch(url, { method: config.method || 'GET' });
        output = await res.json().catch(() => ({}));
      } else if (type === 'db_write') {
        const orgId = await adminQuery(`query($id: uuid!) { workflow_runs_by_pk(id: $id) { org_id } }`, { id: runId });
        await adminQuery(`
          mutation($orgId: uuid!, $runId: uuid!, $key: String!, $value: jsonb!) {
            insert_workflow_outputs_one(object: { org_id: $orgId, workflow_run_id: $runId, key: $key, value: $value }) { id }
          }
        `, { orgId: orgId.workflow_runs_by_pk.org_id, runId, key: config.key || 'output', value: previousOutput || {} });
        output = { success: true };
      } else if (type === 'conditional_branch') {
        const val = previousOutput?.result || previousOutput;
        let conditionMet = false;
        if (config.condition) {
          if (config.condition.operator === 'contains') conditionMet = String(val).includes(String(config.condition.value));
          else if (config.condition.operator === 'equals') conditionMet = val === config.condition.value;
        }
        output = { conditionMet };
      } else {
        output = { type, status: 'executed' };
      }

      await adminQuery(`
        mutation($id: uuid!, $output: jsonb) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: completed, output: $output, completed_at: "now()" }) { id } }
      `, { id: stepRun.id, output });
      previousOutput = output;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await adminQuery(`mutation($id: uuid!, $e: String) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: failed, error: $e }) { id } }`, { id: stepRun.id, e: msg });
      await adminQuery(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: failed }) { id } }`, { id: runId });
      return;
    }
  }
  
  await adminQuery(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: completed, completed_at: "now()" }) { id } }`, { id: runId });
  const orgId = await adminQuery(`query($id: uuid!) { workflow_runs_by_pk(id: $id) { org_id } }`, { id: runId });
  if (orgId.workflow_runs_by_pk?.org_id) {
    await adminQuery(`mutation($orgId: uuid!) { update_organizations_by_pk(pk_columns: { id: $orgId }, _inc: { quota_used: 1 }) { id } }`, { orgId: orgId.workflow_runs_by_pk.org_id });
  }
}
