import { Request, Response } from 'express';
import { verifyOrgMembership } from './_utils/auth';
import { adminQuery } from './_utils/graphql';
import { executeWorkflow } from './_utils/executor';

export default async function handler(req: Request, res: Response) {
  try {
    const { session_variables, input } = req.body;
    const userId = session_variables?.['x-hasura-user-id'];
    const stepRunId = input?.step_run_id;
    
    if (!userId) return res.status(400).json({ message: 'Not authenticated' });
    if (!stepRunId) return res.status(400).json({ message: 'step_run_id is required' });
    
    const stepData = await adminQuery(`
      query GetStepRun($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id
          status
          position
          workflow_run {
            id
            org_id
          }
        }
      }
    `, { id: stepRunId });
    
    const stepRun = stepData.step_runs_by_pk;
    if (!stepRun) return res.status(404).json({ message: 'Step run not found' });
    if (stepRun.status !== 'paused') return res.status(400).json({ message: 'Step is not paused' });
    
    const orgId = stepRun.workflow_run.org_id;
    const membership = await verifyOrgMembership(userId, orgId, ['owner', 'editor']);
    if (!membership) return res.status(403).json({ message: 'Insufficient permissions' });
    
    const update = await adminQuery(`
      mutation ApproveStep($id: uuid!, $userId: uuid!, $time: timestamptz!) {
        update_step_runs(
          where: { id: { _eq: $id }, status: { _eq: paused } },
          _set: { status: completed, approved_by: $userId, approved_at: $time }
        ) { affected_rows }
      }
    `, { id: stepRunId, userId, time: new Date().toISOString() });
    
    if (update.update_step_runs.affected_rows === 0) {
      return res.status(409).json({ message: 'Step already approved or no longer paused' });
    }
    
    executeWorkflow(stepRun.workflow_run.id, stepRun.position + 1).catch(console.error);
    
    return res.json({ workflow_run_id: stepRun.workflow_run.id, status: 'running' });
  } catch (error: any) {
    console.error('approve-step error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
}
