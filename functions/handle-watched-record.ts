import { Request, Response } from 'express';
import { adminQuery } from './_utils/graphql';
import { executeWorkflow } from './_utils/executor';

export default async function handler(req: Request, res: Response) {
  try {
    const { event } = req.body;
    const newRow = event?.data?.new;
    if (!newRow) return res.status(400).json({ success: false });
    
    const { org_id, payload } = newRow;
    
    const triggersData = await adminQuery(`
      query GetTriggers($orgId: uuid!) {
        workflow_triggers(where: {
          type: { _eq: "database_event" },
          enabled: { _eq: true },
          workflow: { org_id: { _eq: $orgId } }
        }) {
          workflow_id
        }
      }
    `, { orgId: org_id });
    
    for (const trigger of triggersData.workflow_triggers) {
      const runData = await adminQuery(`
        mutation CreateRun($workflowId: uuid!, $orgId: uuid!, $context: jsonb!) {
          insert_workflow_runs_one(object: {
            workflow_id: $workflowId,
            org_id: $orgId,
            status: "pending",
            context: $context
          }) { id }
        }
      `, { workflowId: trigger.workflow_id, orgId: org_id, context: payload || {} });
      
      const runId = runData.insert_workflow_runs_one.id;
      
      const stepsData = await adminQuery(`
        query GetSteps($workflowId: uuid!) {
          workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { position: asc }) {
            id
            position
          }
        }
      `, { workflowId: trigger.workflow_id });
      
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
    }
    
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false });
  }
}
