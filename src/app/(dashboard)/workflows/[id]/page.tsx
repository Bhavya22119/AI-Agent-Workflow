"use client";
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useGraphQL } from '@/hooks/useGraphQL';
import { Badge } from '@/components/ui/badge';

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { request } = useGraphQL();
  
  const [workflow, setWorkflow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    const fetchWf = async () => {
      try {
        const data = await request(`
          query GetWorkflow($id: uuid!) {
            workflows_by_pk(id: $id) {
              id
              name
              description
              workflow_runs(order_by: { started_at: desc }, limit: 10) {
                id
                status
                started_at
              }
            }
          }
        `, { id });
        setWorkflow(data.workflows_by_pk);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchWf();
  }, [id, request]);

  const handleRun = async () => {
    setTriggering(true);
    try {
      const data = await request(`
        mutation TriggerRun($id: uuid!) {
          triggerWorkflowRun(workflow_id: $id) {
            workflow_run_id
            status
          }
        }
      `, { id });
      
      const runId = data.triggerWorkflowRun.workflow_run_id;
      if (runId) {
        router.push(`/workflows/${id}/runs/${runId}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to trigger workflow');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;
  if (!workflow) return <div className="p-8 text-center text-rose-500">Workflow not found</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">{workflow.name}</h1>
        <div className="space-x-4">
          <Button variant="secondary" onClick={() => router.push('/workflows')}>Back</Button>
          <Button onClick={handleRun} disabled={triggering}>{triggering ? 'Triggering...' : 'Run Now'}</Button>
        </div>
      </div>

      <Card>
        <p className="text-slate-400 mb-4">{workflow.description}</p>
        <div className="p-4 bg-slate-800 rounded-lg font-mono text-sm">ID: {id}</div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold mb-4">Recent Runs</h2>
        <div className="space-y-2">
          {workflow.workflow_runs?.map((r: any) => (
            <div key={r.id} className="flex justify-between items-center p-3 hover:bg-slate-800 rounded-md cursor-pointer transition-colors" onClick={() => router.push(`/workflows/${id}/runs/${r.id}`)}>
              <span>Run {new Date(r.started_at).toLocaleString()}</span>
              <div className="flex items-center space-x-4">
                <Badge status={r.status} label={r.status} />
                <span className="text-indigo-400 text-sm">View details →</span>
              </div>
            </div>
          ))}
          {workflow.workflow_runs?.length === 0 && <div className="text-slate-500 italic">No runs yet</div>}
        </div>
      </Card>
    </div>
  );
}
