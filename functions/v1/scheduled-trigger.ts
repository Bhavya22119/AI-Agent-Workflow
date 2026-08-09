import { Request, Response } from 'express';
import { adminQuery } from './_utils/graphql';
import { executeWorkflow } from './_utils/executor';

export default async function handler(req: Request, res: Response) {
  try {
    const triggersData = await adminQuery(`
      query GetScheduledTriggers {
        workflow_triggers(where: { type: { _eq: "scheduled" }, enabled: { _eq: true } }) {
          workflow_id
          workflow { org_id }
        }
      }
    `);
    
    for (const trigger of triggersData.workflow_triggers) {
      const runData = await adminQuery(`
        mutation CreateRun($workflowId: uuid!, $orgId: uuid!) {
          insert_workflow_runs_one(object: {
            workflow_id: $workflowId,
            org_id: $orgId,
            status: "pending",
            context: {}
          }) { id }
        }
      `, { workflowId: trigger.workflow_id, orgId: trigger.workflow.org_id });
      
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
    
    return res.json({ success: true, triggered: triggersData.workflow_triggers.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false });
  }
}
