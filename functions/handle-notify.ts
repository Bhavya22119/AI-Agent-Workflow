import { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  try {
    const { event } = req.body;
    if (!event || !event.data || !event.data.new) return res.status(400).json({ success: false });
    
    const newRow = event.data.new;
    console.log(`[NOTIFY] New workflow output: key=${newRow.key}, org_id=${newRow.org_id}, run_id=${newRow.workflow_run_id}`);
    console.log(`[NOTIFY] Value:`, JSON.stringify(newRow.value));
    
    return res.json({ success: true });
  } catch (error) {
    console.error('handle-notify error:', error);
    return res.status(500).json({ success: false });
  }
}
