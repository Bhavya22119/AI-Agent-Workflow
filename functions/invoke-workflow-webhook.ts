import { Request, Response } from 'express';
import { adminQuery } from './_utils/graphql';
import { executeWorkflow } from './_utils/executor';

export default async function handler(req: Request, res: Response) {
  try {
    const { workflow_id, secret, payload } = req.body.input || req.body;
    
    const triggerData = await adminQuery(`
      query GetTrigger($workflowId: uuid!) {
        workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: "webhook" } }) {
          id
          enabled
          webhook_secret
          workflow { org_id }
        }
      }
    `, { workflowId: workflow_id });
    
    const trigger = triggerData.workflow_triggers[0];
    if (!trigger) return res.status(404).json({ message: 'Webhook trigger not found' });
    if (!trigger.enabled) return res.status(400).json({ message: 'Trigger is disabled' });
    if (trigger.webhook_secret !== secret) return res.status(403).json({ message: 'Invalid secret' });
    
    const runData = await adminQuery(`
      mutation CreateRun($workflowId: uuid!, $orgId: uuid!, $context: jsonb!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflowId,
          org_id: $orgId,
          status: "pending",
          context: $context
        }) { id }
      }
    `, { workflowId: workflow_id, orgId: trigger.workflow.org_id, context: payload || {} });
    
    const runId = runData.insert_workflow_runs_one.id;
    
    const stepsData = await adminQuery(`
      query GetSteps($workflowId: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { position: asc }) {
          id
          position
        }
      }
    `, { workflowId: workflow_id });
    
    const stepRunObjects = stepsData.workflow_steps.map((step: any) => ({
      workflow_run_id: runId,
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
    
    executeWorkflow(runId).catch(console.error);
    
    return res.json({ workflow_run_id: runId, status: 'pending' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
