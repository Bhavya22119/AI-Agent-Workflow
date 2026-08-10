"use client";
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGraphQL } from '@/hooks/useGraphQL';
import { useAccessToken } from '@nhost/react';
import { nhost } from '@/lib/nhost';
import { createClient } from 'graphql-ws';
import { useOrg } from '@/hooks/useOrg';

// ───────── GraphQL operations ─────────

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

const SUBSCRIPTION_QUERY = `
  subscription WatchStepRuns($runId: uuid!) {
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

const SUBSCRIPTION_RUN_STATUS = `
  subscription WatchRunStatus($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      started_at
      completed_at
    }
  }
`;

const STEP_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  llm_call: { label: 'LLM Call', icon: '🤖' },
  http_request: { label: 'HTTP Request', icon: '🌐' },
  db_write: { label: 'DB Write', icon: '💾' },
  notify: { label: 'Notify', icon: '🔔' },
  conditional_branch: { label: 'Conditional Branch', icon: '🔀' },
  approval_gate: { label: 'Approval Gate', icon: '⏸' },
};

// ───────── Component ─────────

export default function WorkflowRunPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;
  const { request } = useGraphQL();
  const accessToken = useAccessToken();
  const { role } = useOrg();
  
  const [run, setRun] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [approving, setApproving] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState<'subscription' | 'polling'>('subscription');
  
  const wsClientRef = useRef<any>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // ── Initial data fetch ──
  const fetchRun = useCallback(async () => {
    try {
      const data = await request(GET_RUN_QUERY, { runId });
      if (data.workflow_runs_by_pk) setRun(data.workflow_runs_by_pk);
      if (data.step_runs) setSteps(data.step_runs);
    } catch (err) {
      console.error("Failed to fetch run data:", err);
    } finally {
      setLoading(false);
    }
  }, [runId, request]);

  useEffect(() => { fetchRun(); }, [fetchRun]);

  // ── WebSocket Subscription (primary) ──
  useEffect(() => {
    if (!accessToken || !runId) return;
    
    const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
    const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
    const wsUrl = `wss://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
    
    let disposed = false;
    
    try {
      const client = createClient({
        url: wsUrl,
        connectionParams: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        shouldRetry: () => !disposed,
        retryAttempts: 3,
        on: {
          connected: () => {
            if (!disposed) {
              setIsLive(true);
              setConnectionMethod('subscription');
              // Stop polling fallback if subscription connects
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
            }
          },
          closed: () => {
            if (!disposed) {
              setIsLive(false);
              startPollingFallback();
            }
          },
          error: () => {
            if (!disposed) {
              setIsLive(false);
              startPollingFallback();
            }
          },
        },
      });
      
      wsClientRef.current = client;

      // Subscribe to step_runs changes
      const stepUnsubscribe = client.subscribe(
        { query: SUBSCRIPTION_QUERY, variables: { runId } },
        {
          next: (result: any) => {
            if (result.data?.step_runs) {
              setSteps(result.data.step_runs);
            }
          },
          error: (err: any) => { console.warn('Step subscription error:', err); },
          complete: () => {},
        }
      );

      // Subscribe to run status changes
      const runUnsubscribe = client.subscribe(
        { query: SUBSCRIPTION_RUN_STATUS, variables: { runId } },
        {
          next: (result: any) => {
            if (result.data?.workflow_runs_by_pk) {
              setRun(result.data.workflow_runs_by_pk);
              const status = result.data.workflow_runs_by_pk.status;
              if (status === 'completed' || status === 'failed') {
                setIsLive(false);
              }
            }
          },
          error: (err: any) => { console.warn('Run subscription error:', err); },
          complete: () => {},
        }
      );
      
      return () => {
        disposed = true;
        stepUnsubscribe();
        runUnsubscribe();
        client.dispose();
        wsClientRef.current = null;
      };
    } catch (err) {
      console.warn('WebSocket subscription failed, falling back to polling:', err);
      startPollingFallback();
    }
  }, [accessToken, runId]);

  // ── Polling Fallback ──
  const startPollingFallback = useCallback(() => {
    if (pollingRef.current) return; // already polling
    setConnectionMethod('polling');
    setIsLive(true);
    pollingRef.current = setInterval(async () => {
      try {
        const data = await request(GET_RUN_QUERY, { runId });
        if (data.workflow_runs_by_pk) {
          setRun(data.workflow_runs_by_pk);
          const status = data.workflow_runs_by_pk.status;
          if (status === 'completed' || status === 'failed') {
            setIsLive(false);
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        }
        if (data.step_runs) setSteps(data.step_runs);
      } catch {} // silent on polling errors
    }, 2000);
  }, [request, runId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // ── Approve via Hasura Action (proper server-side role check) ──
  const handleApprove = async (stepRunId: string) => {
    setApproving(true);
    try {
      // Use the approveStep Hasura Action — this verifies role server-side
      // and calls executeWorkflow() to resume from next step
      await request(`
        mutation ApproveStep($stepRunId: uuid!) {
          approveStep(step_run_id: $stepRunId) {
            workflow_run_id
            status
          }
        }
      `, { stepRunId });
      
      // Subscription will auto-update the UI
      fetchRun(); // Also refetch for immediate feedback
    } catch (actionErr: any) {
      console.warn('approveStep Action failed, trying API route fallback:', actionErr);
      
      // Fallback: our Next.js API route (checks role + resumes execution)
      try {
        const user = nhost.auth.getUser();
        const res = await fetch('/api/approve-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step_run_id: stepRunId, user_id: user?.id }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || 'Approve failed');
        fetchRun();
      } catch (apiErr: any) {
        console.error('Both approve paths failed:', apiErr);
        alert('Failed to approve step: ' + apiErr.message);
      }
    } finally {
      setApproving(false);
    }
  };

  // ── Step display helpers ──
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
            {isLive && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Live — {connectionMethod === 'subscription' ? 'WebSocket Subscription' : 'Polling'}
              </span>
            )}
            {!isLive && run?.status && (
              <span className="text-xs text-slate-500">
                Execution {run.status}
              </span>
            )}
          </div>
        </div>
        <Badge status={run.status} label={run.status} />
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
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-amber-400 font-medium">⚠️ Workflow is paused — awaiting manual approval to continue.</p>
        </div>
      )}

      {/* Step cards */}
      <div className="space-y-3 mt-8">
        <h2 className="text-lg font-semibold text-slate-300">Steps</h2>
        
        {steps.map((step, idx) => {
          const meta = STEP_TYPE_LABELS[step.workflow_step?.type] || { label: step.workflow_step?.type || 'Step', icon: '⚙' };
          return (
            <div key={step.id}>
              <Card className={`transition-all duration-500 ${
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
                    <pre className="text-xs text-rose-400 font-mono whitespace-pre-wrap">{step.error}</pre>
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
                      {role !== 'viewer' && (
                        <Button 
                          className="bg-amber-500 hover:bg-amber-600 text-white border-none shadow-lg shadow-amber-500/20"
                          onClick={() => handleApprove(step.id)}
                          disabled={approving}
                        >
                          {approving ? 'Approving...' : '✅ Approve & Continue'}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Approved info */}
                {step.approved_by && (
                  <div className="mt-2 text-xs text-slate-500">
                    ✅ Approved by {step.approved_by.slice(0, 8)}... at {new Date(step.approved_at).toLocaleString()}
                  </div>
                )}
              </Card>

              {/* Connector line between steps */}
              {idx < steps.length - 1 && (
                <div className="ml-[29px] h-3 w-px bg-slate-700" />
              )}
            </div>
          );
        })}

        {steps.length === 0 && !loading && (
          <div className="text-center py-8 text-slate-500 italic">No steps found for this run.</div>
        )}
      </div>
    </div>
  );
}
