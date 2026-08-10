import { NextRequest, NextResponse } from 'next/server';

const GRAPHQL_URL = `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1'}.nhost.run/v1/graphql`;
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

async function adminQuery(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await response.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// ── Step Executors ──

async function callLLM(prompt: string, model: string = 'llama-3.1-8b-instant') {
  if (GROQ_API_KEY) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024, temperature: 0.7 }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Groq API error: ${res.status} - ${errorBody}`);
    }
    const data: any = await res.json();
    return { result: data.choices[0]?.message?.content || '', provider: 'groq' };
  }
  // Stub fallback
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
  const lower = prompt.toLowerCase();
  let result = '[STUB] This is a deterministic LLM stub response.';
  if (lower.includes('sentiment') || lower.includes('positive') || lower.includes('negative'))
    result = '[STUB] positive - The text has a generally positive sentiment with optimistic undertones.';
  else if (lower.includes('summarize') || lower.includes('summary'))
    result = '[STUB] Summary: The input text discusses key topics with relevant details.';
  return { result, provider: 'stub' };
}

function interpolate(template: string, input: any): string {
  if (!template) return '';
  return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    key = key.trim();
    if (key === 'input' || key === 'prev_output') return typeof input === 'object' ? JSON.stringify(input) : String(input);
    return match;
  });
}

async function executeStep(type: string, config: any, input: any, runId: string) {
  switch (type) {
    case 'llm_call': {
      const prompt = interpolate(config.prompt || '', input);
      let attempt = 0;
      while (attempt < 2) {
        try { return await callLLM(prompt, config.model); } 
        catch (err) { attempt++; if (attempt >= 2) throw err; await new Promise(r => setTimeout(r, 1000)); }
      }
      break;
    }
    case 'http_request': {
      const url = interpolate(config.url || '', input);
      let attempt = 0;
      while (attempt < 2) {
        try {
          const res = await fetch(url, {
            method: config.method || 'GET',
            headers: config.headers || {},
            body: config.body ? interpolate(JSON.stringify(config.body), input) : undefined,
          });
          if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
          return await res.json().catch(() => ({}));
        } catch (err) { attempt++; if (attempt >= 2) throw err; await new Promise(r => setTimeout(r, 1000)); }
      }
      break;
    }
    case 'db_write': {
      const orgId = await getRunOrgId(runId);
      await adminQuery(`
        mutation($orgId: uuid!, $runId: uuid!, $key: String!, $value: jsonb!) {
          insert_workflow_outputs_one(object: { org_id: $orgId, workflow_run_id: $runId, key: $key, value: $value }) { id }
        }
      `, { orgId, runId, key: config.key || 'output', value: input });
      return { success: true };
    }
    case 'notify': {
      const orgId = await getRunOrgId(runId);
      await adminQuery(`
        mutation($orgId: uuid!, $runId: uuid!, $key: String!, $value: jsonb!) {
          insert_workflow_outputs_one(object: { org_id: $orgId, workflow_run_id: $runId, key: $key, value: $value }) { id }
        }
      `, { orgId, runId, key: 'notify_' + (config.channel || 'default'), value: input });
      return { success: true };
    }
    case 'conditional_branch': {
      const val = input?.result || input;
      let conditionMet = false;
      if (config.condition) {
        const { operator, value } = config.condition;
        if (operator === 'equals') conditionMet = val === value;
        else if (operator === 'not_equals') conditionMet = val !== value;
        else if (operator === 'contains') conditionMet = String(val).includes(String(value));
      }
      return { conditionMet };
    }
    default:
      throw new Error(`Unknown step type: ${type}`);
  }
}

async function getRunOrgId(runId: string) {
  const data = await adminQuery(`query($id: uuid!) { workflow_runs_by_pk(id: $id) { org_id } }`, { id: runId });
  return data.workflow_runs_by_pk?.org_id;
}

// ── Main executor (runs in background) ──

async function executeWorkflow(runId: string, startPosition: number = 1) {
  await adminQuery(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: running }) { id } }`, { id: runId });

  const stepsData = await adminQuery(`
    query($runId: uuid!, $startPos: Int!) {
      step_runs(where: { workflow_run_id: { _eq: $runId }, position: { _gte: $startPos } }, order_by: { position: asc }) {
        id workflow_step_id position status
        workflow_step { type config }
      }
    }
  `, { runId, startPos: startPosition });

  let previousOutput: any = null;

  if (startPosition > 1) {
    const prevData = await adminQuery(`
      query($runId: uuid!, $pos: Int!) {
        step_runs(where: { workflow_run_id: { _eq: $runId }, position: { _lt: $pos } }, order_by: { position: desc }, limit: 1) { output }
      }
    `, { runId, pos: startPosition });
    previousOutput = prevData.step_runs?.[0]?.output || null;
  }

  for (const stepRun of stepsData.step_runs) {
    if (stepRun.status === 'skipped') continue;
    try {
      await adminQuery(`
        mutation($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: running, started_at: "now()" }) { id } }
      `, { id: stepRun.id });

      const input = previousOutput || {};
      const stepType = stepRun.workflow_step.type;
      const config = stepRun.workflow_step.config || {};

      if (stepType === 'approval_gate') {
        await adminQuery(`
          mutation($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: paused, input: {} }) { id } }
        `, { id: stepRun.id });
        await adminQuery(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: paused }) { id } }`, { id: runId });
        return; // Stop execution — wait for approval
      }

      // Handle conditional_branch skipping
      if (stepType === 'conditional_branch') {
        const output = await executeStep(stepType, config, input, runId);
        if (config.false_next && !output.conditionMet) {
          // Skip steps between current and false_next
          for (const sr of stepsData.step_runs) {
            if (sr.position > stepRun.position && sr.position < config.false_next) {
              await adminQuery(`mutation($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: skipped }) { id } }`, { id: sr.id });
            }
          }
        }
        await adminQuery(`
          mutation($id: uuid!, $output: jsonb) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: completed, output: $output, completed_at: "now()" }) { id } }
        `, { id: stepRun.id, output });
        previousOutput = output;
        continue;
      }

      const output = await executeStep(stepType, config, input, runId);
      await adminQuery(`
        mutation($id: uuid!, $output: jsonb) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: completed, output: $output, completed_at: "now()" }) { id } }
      `, { id: stepRun.id, output });
      previousOutput = output;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await adminQuery(`
        mutation($id: uuid!, $error: String) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: failed, error: $error }) { id } }
      `, { id: stepRun.id, error: errorMsg });
      await adminQuery(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: failed }) { id } }`, { id: runId });
      return;
    }
  }

  await adminQuery(`mutation($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: completed, completed_at: "now()" }) { id } }`, { id: runId });
  
  // Increment quota
  const orgId = await getRunOrgId(runId);
  if (orgId) {
    await adminQuery(`mutation($orgId: uuid!) { update_organizations_by_pk(pk_columns: { id: $orgId }, _inc: { quota_used: 1 }) { id } }`, { orgId });
  }
}

// ── POST handler ──

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflow_id, user_id } = body;

    if (!workflow_id) return NextResponse.json({ message: 'workflow_id required' }, { status: 400 });
    if (!user_id) return NextResponse.json({ message: 'user_id required' }, { status: 400 });

    // 1. Get workflow org
    const wfData = await adminQuery(`query($id: uuid!) { workflows_by_pk(id: $id) { org_id } }`, { id: workflow_id });
    const orgId = wfData.workflows_by_pk?.org_id;
    if (!orgId) return NextResponse.json({ message: 'Workflow not found' }, { status: 404 });

    // 2. Verify membership (owner/editor)
    const memberData = await adminQuery(`
      query($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId }, role: { _in: [owner, editor] } }) { id role }
      }
    `, { userId: user_id, orgId });
    if (!memberData.org_members?.length) return NextResponse.json({ message: 'Insufficient permissions' }, { status: 403 });

    // 3. Check quota
    const quotaData = await adminQuery(`query($orgId: uuid!) { organizations_by_pk(id: $orgId) { quota_allowed quota_used } }`, { orgId });
    const org = quotaData.organizations_by_pk;
    if (org && org.quota_used >= org.quota_allowed) return NextResponse.json({ message: 'Quota exhausted' }, { status: 429 });

    // 4. Create run
    const runData = await adminQuery(`
      mutation($wfId: uuid!, $orgId: uuid!, $userId: uuid!) {
        insert_workflow_runs_one(object: { workflow_id: $wfId, org_id: $orgId, status: pending, started_by: $userId }) { id }
      }
    `, { wfId: workflow_id, orgId, userId: user_id });
    const runId = runData.insert_workflow_runs_one.id;

    // 5. Create step_runs
    const stepsData = await adminQuery(`
      query($wfId: uuid!) { workflow_steps(where: { workflow_id: { _eq: $wfId } }, order_by: { position: asc }) { id position } }
    `, { wfId: workflow_id });
    
    const stepRunObjects = stepsData.workflow_steps.map((s: any) => ({
      workflow_run_id: runId, workflow_step_id: s.id, position: s.position, status: 'pending',
    }));
    if (stepRunObjects.length > 0) {
      await adminQuery(`mutation($objects: [step_runs_insert_input!]!) { insert_step_runs(objects: $objects) { affected_rows } }`, { objects: stepRunObjects });
    }

    // 6. Execute workflow steps sequentially
    await executeWorkflow(runId);

    return NextResponse.json({ workflow_run_id: runId, status: 'started' });
  } catch (error: any) {
    console.error('trigger-run API error:', error);
    return NextResponse.json({ message: error.message || 'Internal error' }, { status: 500 });
  }
}
