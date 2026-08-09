"use client";
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useGraphQL } from '@/hooks/useGraphQL';
import { useOrg } from '@/hooks/useOrg';

const STEP_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  llm_call: { label: 'LLM Call', icon: '🤖', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  http_request: { label: 'HTTP Request', icon: '🌐', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  db_write: { label: 'DB Write', icon: '💾', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  notify: { label: 'Notify', icon: '🔔', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  conditional_branch: { label: 'Conditional', icon: '🔀', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  approval_gate: { label: 'Approval Gate', icon: '⏸', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
};

const TRIGGER_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  manual: { label: 'Manual', icon: '👆' },
  webhook: { label: 'Webhook', icon: '🔗' },
  scheduled: { label: 'Scheduled', icon: '⏰' },
  database_event: { label: 'Database Event', icon: '📡' },
};

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { request } = useGraphQL();
  const { role } = useOrg();
  
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
              created_at
              workflow_steps(order_by: { position: asc }) {
                id
                position
                type
                config
              }
              workflow_triggers {
                id
                type
                enabled
                webhook_secret
              }
              workflow_runs(order_by: { started_at: desc }, limit: 10) {
                id
                status
                started_at
                completed_at
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">{workflow.name}</h1>
          {workflow.description && (
            <p className="text-slate-400 mt-1">{workflow.description}</p>
          )}
          <p className="text-xs text-slate-500 mt-2">
            Created {new Date(workflow.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => router.push('/workflows')}>Back</Button>
          {(role === 'owner' || role === 'editor') && (
            <Button onClick={handleRun} disabled={triggering}>
              {triggering ? 'Triggering...' : '▶ Run Workflow'}
            </Button>
          )}
        </div>
      </div>

      {/* Workflow Steps */}
      <Card>
        <h2 className="text-xl font-bold text-white mb-4">
          Steps ({workflow.workflow_steps?.length || 0})
        </h2>
        <div className="space-y-3">
          {workflow.workflow_steps?.map((step: any, idx: number) => {
            const meta = STEP_TYPE_LABELS[step.type] || { label: step.type, icon: '⚙', color: 'text-slate-400 bg-slate-800 border-slate-700' };
            return (
              <div key={step.id} className="relative">
                <div className={`flex items-center gap-4 p-3 rounded-lg border ${meta.color}`}>
                  <div className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-slate-300">
                    {step.position}
                  </div>
                  <span className="text-lg">{meta.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium text-white">{meta.label}</p>
                    {step.type === 'llm_call' && step.config?.prompt && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">Prompt: {step.config.prompt}</p>
                    )}
                    {step.type === 'http_request' && step.config?.url && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">{step.config.method || 'GET'} {step.config.url}</p>
                    )}
                    {step.type === 'conditional_branch' && step.config?.condition && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        If {step.config.condition.path} {step.config.condition.operator} &quot;{step.config.condition.value}&quot;
                      </p>
                    )}
                    {step.type === 'approval_gate' && step.config?.message && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">{step.config.message}</p>
                    )}
                    {step.type === 'db_write' && step.config?.key && (
                      <p className="text-xs text-slate-400 mt-0.5">Key: {step.config.key}</p>
                    )}
                  </div>
                </div>
                {/* Connector */}
                {idx < (workflow.workflow_steps?.length || 0) - 1 && (
                  <div className="ml-[19px] h-3 w-px bg-slate-700" />
                )}
              </div>
            );
          })}
          {(!workflow.workflow_steps || workflow.workflow_steps.length === 0) && (
            <p className="text-slate-500 italic text-sm">No steps configured</p>
          )}
        </div>
      </Card>

      {/* Triggers */}
      <Card>
        <h2 className="text-xl font-bold text-white mb-4">Triggers</h2>
        <div className="flex flex-wrap gap-3">
          {workflow.workflow_triggers?.map((trigger: any) => {
            const meta = TRIGGER_TYPE_LABELS[trigger.type] || { label: trigger.type, icon: '⚡' };
            return (
              <div key={trigger.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                trigger.enabled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'
              }`}>
                <span>{meta.icon}</span>
                <span className="text-sm font-medium text-white">{meta.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  trigger.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  {trigger.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
            );
          })}
          {(!workflow.workflow_triggers || workflow.workflow_triggers.length === 0) && (
            <p className="text-slate-500 italic text-sm">No triggers configured</p>
          )}
        </div>
      </Card>

      {/* Recent Runs */}
      <Card>
        <h2 className="text-xl font-bold mb-4">Recent Runs</h2>
        <div className="space-y-2">
          {workflow.workflow_runs?.map((r: any) => (
            <div key={r.id} className="flex justify-between items-center p-3 hover:bg-slate-800 rounded-md cursor-pointer transition-colors" onClick={() => router.push(`/workflows/${id}/runs/${r.id}`)}>
              <div>
                <span className="text-sm text-white">Run {new Date(r.started_at).toLocaleString()}</span>
                {r.completed_at && (
                  <span className="text-xs text-slate-500 ml-2">
                    ({Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s)
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4">
                <Badge status={r.status} label={r.status} />
                <span className="text-indigo-400 text-sm">View →</span>
              </div>
            </div>
          ))}
          {workflow.workflow_runs?.length === 0 && <div className="text-slate-500 italic">No runs yet</div>}
        </div>
      </Card>
    </div>
  );
}
