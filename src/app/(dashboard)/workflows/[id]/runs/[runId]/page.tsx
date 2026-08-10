"use client";
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGraphQL } from '@/hooks/useGraphQL';
import { nhost } from '@/lib/nhost';

const GET_RUN_QUERY = `
  query GetRunData($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      started_at
      completed_at
    }
    step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { position: asc }) {
      id
      position
      status
      input
      output
      error
      attempt_count
      started_at
      completed_at
      approved_by
      approved_at
      workflow_step {
        type
        config
      }
    }
  }
`;

export default function WorkflowRunPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;
  const { request } = useGraphQL();
  
  const [run, setRun] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(true);
  const [approving, setApproving] = useState(false);

  const fetchRun = useCallback(async () => {
    try {
      const data = await request(GET_RUN_QUERY, { runId });
      
      if (data.workflow_runs_by_pk) {
        setRun(data.workflow_runs_by_pk);
        const status = data.workflow_runs_by_pk.status;
        if (status === 'completed' || status === 'failed') {
          setIsPolling(false);
        }
      }
      if (data.step_runs) setSteps(data.step_runs);
    } catch (err) {
      console.error("Failed to fetch run data:", err);
    } finally {
      setLoading(false);
    }
  }, [runId, request]);

  // Initial fetch
  useEffect(() => { fetchRun(); }, [fetchRun]);

  // Polling
  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(fetchRun, 1500);
    return () => clearInterval(interval);
  }, [isPolling, fetchRun]);

  const handleApprove = async (stepRunId: string) => {
    setApproving(true);
    try {
      const user = nhost.auth.getUser();
      const userId = user?.id || '';

      // 1. Complete the paused step
      await request(`
        mutation ApproveStepDirect($id: uuid!, $userId: uuid!, $time: timestamptz!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id },
            _set: { status: completed, approved_by: $userId, approved_at: $time }
          ) { id }
        }
      `, { id: stepRunId, userId, time: new Date().toISOString() });

      // 2. Set run status back to running
      await request(`
        mutation ResumeRun($id: uuid!) {
          update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: running }) { id }
        }
      `, { id: runId });

      setIsPolling(true);
      fetchRun();
    } catch (err: any) {
      console.error('Approval failed:', err);
      alert('Failed to approve step: ' + err.message);
    } finally {
      setApproving(false);
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'running': return '⟳';
      case 'paused': return '⏸';
      case 'failed': return '✕';
      case 'skipped': return '⏭';
      default: return '○';
    }
  };

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'running': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'paused': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'failed': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'skipped': return 'bg-slate-700/50 text-slate-500 border-slate-600/30';
      default: return 'bg-slate-800 text-slate-500 border-slate-700';
    }
  };

  const STEP_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
    llm_call: { label: 'LLM Call', icon: '🤖' },
    http_request: { label: 'HTTP Request', icon: '🌐' },
    db_write: { label: 'DB Write', icon: '💾' },
    notify: { label: 'Notify', icon: '🔔' },
    conditional_branch: { label: 'Conditional Branch', icon: '🔀' },
    approval_gate: { label: 'Approval Gate', icon: '⏸' },
  };

  if (loading && !run) return <div className="p-8 text-center text-slate-400">Loading run details...</div>;
  if (!run) return <div className="p-8 text-center text-rose-500">Run not found</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => router.back()} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 transition-colors">
        ← Back to Workflow
      </button>

      {/* Run Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Run Viewer</h1>
          <div className="flex items-center gap-3">
            <p className="text-slate-400 text-sm font-mono">{runId.slice(0, 8)}...</p>
            {isPolling && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Live Updating
              </span>
            )}
            {!isPolling && (
              <span className="text-xs text-slate-500">
                Execution {run.status}
              </span>
            )}
          </div>
        </div>
        <Badge status={run.status} label={run.status} className="text-lg px-4 py-1" />
      </div>

      {/* Timeline */}
      {run.started_at && (
        <div className="flex gap-6 text-sm text-slate-400">
          <span>Started: {new Date(run.started_at).toLocaleString()}</span>
          {run.completed_at && <span>Completed: {new Date(run.completed_at).toLocaleString()}</span>}
        </div>
      )}

      {/* Paused banner */}
      {run.status === 'paused' && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg animate-pulse">
          <p className="text-amber-400 font-medium">⚠️ Workflow is paused — awaiting manual approval to continue.</p>
        </div>
      )}

      {/* Step cards */}
      <div className="space-y-4 mt-8">
        {steps.map((step, idx) => {
          const meta = STEP_TYPE_LABELS[step.workflow_step?.type] || { label: step.workflow_step?.type || 'Step', icon: '⚙' };
          return (
            <Card key={step.id} className={`transition-all duration-500 ${
              step.status === 'running' ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 
              step.status === 'paused' ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)]' : ''
            }`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border ${getStepColor(step.status)}`}>
                    {getStepIcon(step.status)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{meta.icon} {meta.label}</h3>
                    <p className="text-xs text-slate-500">
                      Step {step.position}
                      {step.attempt_count > 1 ? ` · Attempt ${step.attempt_count}` : ''}
                    </p>
                  </div>
                </div>
                <Badge status={step.status as any} label={step.status} />
              </div>

              {/* Connector */}
              {idx < steps.length - 1 && (
                <div className="ml-5 mt-2 mb-[-24px] w-px h-6 bg-slate-700" />
              )}

              {/* Output */}
              {step.status === 'completed' && step.output && (
                <div className="mt-4 p-3 bg-slate-950 rounded border border-slate-800 overflow-x-auto">
                  <p className="text-xs text-slate-500 mb-1 font-medium">Output:</p>
                  <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">
                    {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                  </pre>
                </div>
              )}
              
              {/* Error */}
              {step.status === 'failed' && step.error && (
                <div className="mt-4 p-3 bg-slate-950 rounded border border-rose-900/30 overflow-x-auto">
                  <p className="text-xs font-semibold text-rose-500 mb-1">Error:</p>
                  <pre className="text-xs text-rose-400 font-mono whitespace-pre-wrap">
                    {step.error}
                  </pre>
                </div>
              )}

              {/* Approval gate UI */}
              {step.status === 'paused' && step.workflow_step?.type === 'approval_gate' && (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-amber-400 font-medium text-sm">⏸ Awaiting Approval</p>
                      {step.workflow_step.config?.message && (
                        <p className="text-amber-400/70 text-xs mt-1">{step.workflow_step.config.message}</p>
                      )}
                    </div>
                    <Button 
                      className="bg-amber-500 hover:bg-amber-600 text-white border-none shadow-lg shadow-amber-500/20"
                      onClick={() => handleApprove(step.id)}
                      disabled={approving}
                    >
                      {approving ? 'Approving...' : 'Approve & Continue'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Approved info */}
              {step.approved_by && (
                <div className="mt-2 text-xs text-slate-500">
                  Approved by {step.approved_by.slice(0, 8)}... at {new Date(step.approved_at).toLocaleString()}
                </div>
              )}
            </Card>
          );
        })}

        {steps.length === 0 && !loading && (
          <div className="text-center py-8 text-slate-500 italic">No steps found for this run.</div>
        )}
      </div>
    </div>
  );
}
