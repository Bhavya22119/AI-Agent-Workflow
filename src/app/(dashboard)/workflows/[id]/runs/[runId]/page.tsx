"use client";
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGraphQL } from '@/hooks/useGraphQL';

export default function WorkflowRunPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;
  const { request } = useGraphQL();
  
  const [run, setRun] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    let interval: any;
    
    const fetchRun = async () => {
      try {
        const data = await request(`
          query GetRunData($runId: uuid!) {
            workflow_runs_by_pk(id: $runId) {
              id
              status
            }
            step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { position: asc }) {
              id
              position
              status
              output
              error
              workflow_step {
                type
              }
            }
          }
        `, { runId });
        
        if (data.workflow_runs_by_pk) setRun(data.workflow_runs_by_pk);
        if (data.step_runs) setSteps(data.step_runs);
      } catch (err) {
        console.error("Failed to fetch run", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRun();
    interval = setInterval(() => {
      // Short polling for live updates
      fetchRun();
    }, 2000);
    
    return () => clearInterval(interval);
  }, [runId, request]);

  const handleApprove = async (stepRunId: string) => {
    setApproving(true);
    try {
      await request(`
        mutation ApproveStep($stepRunId: uuid!) {
          approveStep(step_run_id: $stepRunId) {
            status
          }
        }
      `, { stepRunId });
    } catch (err) {
      console.error(err);
      alert('Failed to approve step');
    } finally {
      setApproving(false);
    }
  };

  if (loading && !run) return <div className="p-8 text-center text-slate-400">Loading run details...</div>;
  if (!run) return <div className="p-8 text-center text-rose-500">Run not found</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => router.back()} className="text-slate-400 hover:text-white text-sm flex items-center">
        ← Back to Workflow
      </button>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Run Viewer</h1>
          <p className="text-slate-400 text-sm font-mono">{runId}</p>
        </div>
        <Badge status={run.status} label={run.status} className="text-lg px-4 py-1" />
      </div>

      <div className="space-y-4 mt-8">
        {steps.map(step => (
          <Card key={step.id} className={`transition-all duration-300 ${step.status === 'running' ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''}`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : step.status === 'running' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                  {step.position}
                </div>
                <div>
                  <h3 className="font-semibold text-white capitalize">{step.workflow_step.type.replace('_', ' ')}</h3>
                </div>
              </div>
              <Badge status={step.status as any} label={step.status} />
            </div>

            {step.status === 'completed' && step.output && (
              <div className="mt-4 p-3 bg-slate-950 rounded border border-slate-800 overflow-x-auto">
                <pre className="text-xs text-emerald-400 font-mono">
                  {JSON.stringify(step.output, null, 2)}
                </pre>
              </div>
            )}
            
            {step.status === 'failed' && step.error && (
              <div className="mt-4 p-3 bg-slate-950 rounded border border-rose-900/30 overflow-x-auto">
                <p className="text-sm font-semibold text-rose-500 mb-1">Error:</p>
                <pre className="text-xs text-rose-400 font-mono">
                  {step.error}
                </pre>
              </div>
            )}

            {step.status === 'paused' && step.workflow_step.type === 'approval_gate' && (
              <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex justify-between items-center">
                <p className="text-amber-400 text-sm">Workflow is paused, waiting for manual approval before continuing.</p>
                <Button 
                  className="bg-amber-500 hover:bg-amber-600 text-white border-none"
                  onClick={() => handleApprove(step.id)}
                  disabled={approving}
                >
                  {approving ? 'Approving...' : 'Approve & Proceed'}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
