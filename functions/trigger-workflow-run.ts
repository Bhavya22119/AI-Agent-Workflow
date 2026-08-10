import { Request, Response } from 'express';
import { adminQuery } from './_utils/graphql';
import { checkQuota } from './_utils/auth';
import { executeWorkflow } from './_utils/executor';

export default async function handler(req: Request, res: Response) {
  try {
    const { session_variables, input } = req.body || {};
    const userId = session_variables?.['x-hasura-user-id'];
    const workflowId = input?.workflow_id;
    
    if (!userId) return res.status(400).json({ message: 'Not authenticated' });
    if (!workflowId) return res.status(400).json({ message: 'workflow_id is required' });
    
    // 1. Get org_id from workflow
    const wfData = await adminQuery(`
      query GetOrgId($workflowId: uuid!) {
        workflows_by_pk(id: $workflowId) { org_id }
      }
    `, { workflowId });
    
    const orgId = wfData.workflows_by_pk?.org_id;
    if (!orgId) return res.status(404).json({ message: 'Workflow not found' });
    
    // 2. Verify caller is owner/editor in the workflow's org
    const memberData = await adminQuery(`
      query VerifyMembership($userId: uuid!, $orgId: uuid!) {
        org_members(where: {
          user_id: { _eq: $userId },
          org_id: { _eq: $orgId },
          role: { _in: [owner, editor] }
        }) { id role }
      }
    `, { userId, orgId });
    
    if (!memberData.org_members || memberData.org_members.length === 0) {
      return res.status(403).json({ message: 'Insufficient permissions — must be owner or editor in this organization' });
    }
    
    // 3. Check org quota isn't exhausted
    const quotaOk = await checkQuota(orgId);
    if (!quotaOk) {
      return res.status(429).json({ message: 'Organization quota exhausted — cannot start new runs' });
    }
    
    // 4. Create workflow_run
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
    
    // 5. Get steps and create step_runs
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
    
    // 6. Start execution asynchronously (non-blocking)
    executeWorkflow(workflowRun.id).catch((err: any) => {
      console.error('Workflow execution failed:', err);
    });
    
    return res.status(200).json({ workflow_run_id: workflowRun.id, status: 'pending' });
  } catch (error: any) {
    console.error('triggerWorkflowRun error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
}
