import { Request, Response } from 'express';
import { verifyOrgMembership, getOrgIdFromWorkflow, checkQuota } from './_utils/auth';
import { adminQuery } from './_utils/graphql';
import { executeWorkflow } from './_utils/executor';

export default async function handler(req: Request, res: Response) {
  try {
    const { session_variables, input } = req.body;
    const userId = session_variables['x-hasura-user-id'];
    const workflowId = input.workflow_id;
    
    if (!userId) return res.status(400).json({ message: 'Not authenticated' });
    if (!workflowId) return res.status(400).json({ message: 'workflow_id is required' });
    
    const orgId = await getOrgIdFromWorkflow(workflowId);
    if (!orgId) return res.status(404).json({ message: 'Workflow not found' });
    
    const membership = await verifyOrgMembership(userId, orgId, ['owner', 'editor']);
    if (!membership) return res.status(403).json({ message: 'Insufficient permissions' });
    
    const hasQuota = await checkQuota(orgId);
    if (!hasQuota) return res.status(429).json({ message: 'Organization quota exhausted' });
    
    const runData = await adminQuery(`
      mutation CreateRun($workflowId: uuid!, $orgId: uuid!, $startedBy: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflowId,
          org_id: $orgId,
          status: "pending",
          started_by: $startedBy
        }) {
          id
          status
        }
      }
    `, { workflowId, orgId, startedBy: userId });
    
    const workflowRun = runData.insert_workflow_runs_one;
    
    const stepsData = await adminQuery(`
      query GetSteps($workflowId: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { position: asc }) {
          id
          position
          type
          config
        }
      }
    `, { workflowId });
    
    const stepRunObjects = stepsData.workflow_steps.map((step: any) => ({
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
    
    executeWorkflow(workflowRun.id).catch(err => console.error(err));
    
    return res.json({ workflow_run_id: workflowRun.id, status: 'pending' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
