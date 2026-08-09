import { adminQuery } from './graphql';
import { callLLM } from './llm';

export interface StepRun {
  id: string;
  workflow_step_id: string;
  position: number;
  status: string;
  workflow_step: {
    type: string;
    config: Record<string, any>;
  };
}

async function updateRunStatus(id: string, status: string) {
  await adminQuery(`
    mutation UpdateRun($id: uuid!, $status: String!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: $status }) { id }
    }
  `, { id, status });
}

async function updateStepRunStatus(id: string, status: string, updates: any = {}) {
  await adminQuery(`
    mutation UpdateStepRun($id: uuid!, $status: String!, $input: jsonb, $output: jsonb, $error: String) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: $status, input: $input, output: $output, error: $error }) { id }
    }
  `, { id, status, ...updates });
  
  if (updates.incrementAttempt) {
    await adminQuery(`
      mutation IncAttempt($id: uuid!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _inc: { attempt_count: 1 }) { id }
      }
    `, { id });
  }
}

async function loadStepRuns(workflowRunId: string, startPosition: number): Promise<StepRun[]> {
  const data = await adminQuery(`
    query GetStepRuns($workflowRunId: uuid!, $startPos: Int!) {
      step_runs(
        where: { workflow_run_id: { _eq: $workflowRunId }, position: { _gte: $startPos } },
        order_by: { position: asc }
      ) {
        id
        workflow_step_id
        position
        status
        workflow_step {
          type
          config
        }
      }
    }
  `, { workflowRunId, startPos: startPosition });
  return data.step_runs;
}

async function getRunContext(workflowRunId: string): Promise<any> {
  const data = await adminQuery(`
    query GetRunCtx($id: uuid!) {
      workflow_runs_by_pk(id: $id) { context }
    }
  `, { id: workflowRunId });
  return data.workflow_runs_by_pk?.context || {};
}

async function getPreviousStepOutput(workflowRunId: string, position: number): Promise<any> {
  const data = await adminQuery(`
    query GetPrevOutput($workflowRunId: uuid!, $pos: Int!) {
      step_runs(where: { workflow_run_id: { _eq: $workflowRunId }, position: { _lt: $pos } }, order_by: { position: desc }, limit: 1) {
        output
      }
    }
  `, { workflowRunId, pos: position });
  return data.step_runs?.[0]?.output || null;
}

async function getRunOrgId(workflowRunId: string): Promise<string | null> {
  const data = await adminQuery(`
    query GetRunOrgId($id: uuid!) {
      workflow_runs_by_pk(id: $id) { org_id }
    }
  `, { id: workflowRunId });
  return data.workflow_runs_by_pk?.org_id || null;
}

function interpolate(template: string, input: any, stepRuns: StepRun[]): string {
  if (!template) return '';
  return template.replace(/{{(.*?)}}/g, (match, key) => {
    key = key.trim();
    if (key === 'input') return typeof input === 'object' ? JSON.stringify(input) : String(input);
    if (key === 'prev_output') return typeof input === 'object' ? JSON.stringify(input) : String(input);
    if (key.startsWith('step_') && key.endsWith('_output')) {
       return match;
    }
    return match;
  });
}

async function executeLLMCall(config: any, input: any, stepRunId: string): Promise<any> {
  const prompt = interpolate(config.prompt || '', input, []);
  let attempt = 0;
  while (attempt < 2) {
    try {
      const res = await callLLM(prompt, config.model);
      return res;
    } catch (err: any) {
      attempt++;
      if (attempt >= 2) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function executeHTTPRequest(config: any, input: any, stepRunId: string): Promise<any> {
  const url = interpolate(config.url || '', input, []);
  let attempt = 0;
  while (attempt < 2) {
    try {
      const res = await fetch(url, {
        method: config.method || 'GET',
        headers: config.headers || {},
        body: config.body ? interpolate(JSON.stringify(config.body), input, []) : undefined
      });
      if (!res.ok && res.status >= 500) throw new Error(`HTTP Error: ${res.status}`);
      return await res.json().catch(() => ({}));
    } catch (err: any) {
      attempt++;
      if (attempt >= 2) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function executeDBWrite(config: any, input: any, workflowRunId: string): Promise<any> {
  const orgId = await getRunOrgId(workflowRunId);
  await adminQuery(`
    mutation DBWrite($orgId: uuid!, $runId: uuid!, $key: String!, $value: jsonb!) {
      insert_workflow_outputs_one(object: { org_id: $orgId, workflow_run_id: $runId, key: $key, value: $value }) { id }
    }
  `, { orgId, runId: workflowRunId, key: config.key || 'output', value: input });
  return { success: true };
}

async function executeNotify(config: any, input: any, workflowRunId: string): Promise<any> {
  const orgId = await getRunOrgId(workflowRunId);
  await adminQuery(`
    mutation Notify($orgId: uuid!, $runId: uuid!, $key: String!, $value: jsonb!) {
      insert_workflow_outputs_one(object: { org_id: $orgId, workflow_run_id: $runId, key: $key, value: $value }) { id }
    }
  `, { orgId, runId: workflowRunId, key: 'notify_' + (config.channel || 'default'), value: input });
  return { success: true };
}

async function executeConditionalBranch(config: any, input: any, stepRuns: StepRun[], currentPos: number, runId: string): Promise<any> {
  const val = input?.result || input;
  let conditionMet = false;
  if (config.condition) {
    const { operator, value } = config.condition;
    if (operator === 'equals') conditionMet = (val === value);
    else if (operator === 'not_equals') conditionMet = (val !== value);
    else if (operator === 'contains') conditionMet = String(val).includes(String(value));
  }
  
  const skipTo = conditionMet ? config.true_next : config.false_next;
  if (skipTo) {
    for (const step of stepRuns) {
      if (step.position > currentPos && step.position < skipTo) {
        await updateStepRunStatus(step.id, 'skipped');
        step.status = 'skipped';
      }
    }
  }
  return { conditionMet };
}

export async function executeWorkflow(workflowRunId: string, startPosition: number = 1): Promise<void> {
  await updateRunStatus(workflowRunId, 'running');
  
  const stepRuns = await loadStepRuns(workflowRunId, startPosition);
  
  let previousOutput: any = null;
  const context = await getRunContext(workflowRunId);
  
  if (startPosition > 1) {
    previousOutput = await getPreviousStepOutput(workflowRunId, startPosition);
  }
  
  for (const stepRun of stepRuns) {
    if (stepRun.status === 'skipped') continue;
    
    try {
      await updateStepRunStatus(stepRun.id, 'running');
      
      const input = previousOutput || context;
      const stepType = stepRun.workflow_step.type;
      const config = stepRun.workflow_step.config || {};
      
      let output: any;
      
      switch (stepType) {
        case 'llm_call':
          output = await executeLLMCall(config, input, stepRun.id);
          break;
        case 'http_request':
          output = await executeHTTPRequest(config, input, stepRun.id);
          break;
        case 'db_write':
          output = await executeDBWrite(config, input, workflowRunId);
          break;
        case 'notify':
          output = await executeNotify(config, input, workflowRunId);
          break;
        case 'conditional_branch':
          output = await executeConditionalBranch(config, input, stepRuns, stepRun.position, workflowRunId);
          break;
        case 'approval_gate':
          await updateStepRunStatus(stepRun.id, 'paused', { input: input });
          await updateRunStatus(workflowRunId, 'paused');
          return;
        default:
          throw new Error(`Unknown step type: ${stepType}`);
      }
      
      await updateStepRunStatus(stepRun.id, 'completed', { output: output });
      previousOutput = output;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateStepRunStatus(stepRun.id, 'failed', { error: errorMessage, incrementAttempt: true });
      await updateRunStatus(workflowRunId, 'failed');
      return;
    }
  }
  
  await updateRunStatus(workflowRunId, 'completed');
  
  const orgId = await getRunOrgId(workflowRunId);
  if (orgId) {
    await adminQuery(`
      mutation IncrementQuota($orgId: uuid!) {
        update_organizations_by_pk(
          pk_columns: { id: $orgId },
          _inc: { quota_used: 1 }
        ) { id }
      }
    `, { orgId });
  }
}
